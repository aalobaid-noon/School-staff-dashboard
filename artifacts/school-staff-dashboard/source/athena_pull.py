#!/usr/bin/env python3
"""Headless version of the runbook's pull step: runs queries/*.sql on Athena with boto3 and
writes data/_raw_*.json, exactly as the agent does through the MCP connector.

Env: AWS credentials (standard), AWS_REGION, ATHENA_WORKGROUP, ATHENA_OUTPUT (s3://bucket/prefix/, optional if the
workgroup has one). Read-only access to the noon2_* databases is all it needs.
"""
import csv, io, datetime as dt, json, os, pathlib, sys, time
from zoneinfo import ZoneInfo
import boto3

ROOT = pathlib.Path(__file__).resolve().parent
Q, D = ROOT / "queries", ROOT / "data"
TERM = dt.date(2026, 8, 23)
csv.field_size_limit(sys.maxsize)

def windows():
    today = dt.datetime.now(ZoneInfo("Asia/Riyadh")).date()
    end = today + dt.timedelta(days=1)                       # exclusive end = tomorrow
    complete = max((today - TERM).days // 7, 0)              # whole weeks finished so far
    end_wk = TERM + dt.timedelta(days=7 * complete)          # exclusive end of the last complete week
    ts = lambda d: f"TIMESTAMP '{d:%Y-%m-%d} 00:00:00'"
    dtf = lambda d: int(f"{d:%Y%m%d}")
    return {"START": ts(TERM), "END": ts(end), "DT_FROM": dtf(TERM), "DT_TO": dtf(end), "TERM": f"DATE '{TERM}'",
            "END_WK": ts(end_wk), "DT_TO_WK": dtf(end_wk - dt.timedelta(days=1))}

def sql_for(name, common, w):
    body = (Q / name).read_text(encoding="utf-8")
    if name != "07_sim_grades.sql":
        body = common + "\n" + body
    for k, v in w.items():
        body = body.replace("{{" + k + "}}", str(v))
    return body

def run(ath, s3, sql):
    kw = {"QueryString": sql, "WorkGroup": os.environ.get("ATHENA_WORKGROUP", "primary")}
    if os.environ.get("ATHENA_OUTPUT"):
        kw["ResultConfiguration"] = {"OutputLocation": os.environ["ATHENA_OUTPUT"]}
    qid = ath.start_query_execution(**kw)["QueryExecutionId"]
    while True:
        ex = ath.get_query_execution(QueryExecutionId=qid)["QueryExecution"]
        st = ex["Status"]["State"]
        if st == "SUCCEEDED": break
        if st in ("FAILED", "CANCELLED"):
            sys.exit(f"query failed ({st}): {ex['Status'].get('StateChangeReason')}")
        time.sleep(3)
    bucket, key = ex["ResultConfiguration"]["OutputLocation"][5:].split("/", 1)
    text = s3.get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8")
    rows = list(csv.DictReader(io.StringIO(text)))
    if len(rows) != 1:
        sys.exit(f"expected one JSON row, got {len(rows)}")
    return rows[0]

def col(row, c):
    v = row.get(c)
    return json.loads(v) if v else []

# query file -> (columns, output name); several columns of one query are saved separately
JOBS = [
    ("01_campuses.sql",       {"campuses": "campuses"}),
    ("02_exams.sql",          {"exams": "exams", "windows": "windows", "bygrade": "bygrade"}),
    ("03_weekly.sql",         {"weekly": "weekly"}),
    ("04_facilitators.sql",   {"facilitators": "facilitators"}),
    ("05_students_leads.sql", {"*": "students_leads"}),
    ("06_comments.sql",       {"comments": "comments"}),
    ("07_sim_grades.sql",     {"simgrades": "simgrades"}),
]

def main():
    region = os.environ.get("AWS_REGION", "us-east-1")
    ath, s3 = boto3.client("athena", region_name=region), boto3.client("s3", region_name=region)
    common = (Q / "00_common.sql").read_text(encoding="utf-8")
    w = windows(); D.mkdir(exist_ok=True)
    print("window", w["START"], "->", w["END"], "| weekly to", w["END_WK"])
    for name, outs in JOBS:
        print("running", name, flush=True)
        row = run(ath, s3, sql_for(name, common, w))
        if "*" in outs:
            data = {c: col(row, c) for c in row if c != "spill_pad"}
            (D / f"_raw_{outs['*']}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        else:
            for c, out in outs.items():
                (D / f"_raw_{out}.json").write_text(json.dumps(col(row, c), ensure_ascii=False), encoding="utf-8")
    print("pulled", len(JOBS), "queries")

if __name__ == "__main__":
    main()
