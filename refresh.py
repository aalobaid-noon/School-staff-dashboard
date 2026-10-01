#!/usr/bin/env python3
"""
Assemble data/real.json from the raw query results, then rebuild both bundles.

Inputs (written by the agent after running queries/*.sql):
    data/_raw_campuses.json      data/_raw_exams.json
    data/_raw_weekly.json        data/_raw_facilitators.json
    data/_raw_students_leads.json    -> {students, leads, orphans}
    data/_raw_comments.json          -> trust-survey free text
    data/_raw_windows.json           -> the dates each exam is open (02_exams.sql, 2nd column)
    data/_raw_bygrade.json           -> assigned students split by school grade (02_exams.sql, 3rd column)
    data/_raw_simgrades.json         -> diagnostics + simulators by the grade of who sat them, all of Noon (07_sim_grades.sql)

Usage:  python3 refresh.py [--term 2026-08-23] [--window START END]

Refuses to write if a sanity check fails, so a bad extract can never reach the
dashboard silently. Pass --force to override (and say so when you publish).
"""
import argparse, collections, datetime as dt, json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
D    = ROOT / "data"
OUT  = D / "real.json"
TEST_ACCOUNTS = {"school_lead_smoke_test"}


def load(name):
    p = D / f"_raw_{name}.json"
    if not p.exists():
        sys.exit(f"missing {p} — run queries/{name} first (see REFRESH.md)")
    return json.loads(p.read_text(encoding="utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--term", default="2026-08-23")
    ap.add_argument("--window", nargs=2, metavar=("START", "END"))
    ap.add_argument("--rules", default=None, help="rules_version from get_business_rules")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else None
    campuses = load("campuses")
    exams    = load("exams")
    weekly   = load("weekly")
    facs     = load("facilitators")
    sl       = load("students_leads")
    comments_raw = load("comments") if (D / "_raw_comments.json").exists() else []
    windows_raw = load("windows")
    bygrade_raw = load("bygrade")
    simgrades_raw = load("simgrades")
    students_raw, leads_raw, orphans = sl["students"], sl["leads"], sl.get("orphans") or []

    # ---- placeholder facilitators -------------------------------------------------
    # A cohort can point at a Noon-internal utility account instead of a real person.
    # Left alone, that account is rendered as a facilitator responsible for every school
    # its cohort touches — which is how profile 608478 ("Mohamed Hatim", the shared
    # account behind "فريق نون" / "Noon Facilitator") came to appear as the facilitator of
    # 9 schools he has never worked at. The queries exclude them, and this enforces it
    # again here so a stale raw file can never put a real name back on a school.
    internal = {f["fid"]: f for f in (sl.get("internal_facilitators") or [])}
    if internal:
        before = len(facs)
        facs = [f for f in facs if f["fid"] not in internal]
        for s in students_raw:
            if s.get("f") in internal: s["f"] = 0        # 0 renders as "unassigned"
        for c in comments_raw:
            if c.get("f") in internal: c["f"] = 0
        print("placeholder  " + " · ".join(
            f'{f["fname"]} (id {fid}) dropped as facilitator — {f["cohorts"]} cohort across '
            f'{f["campuses"]} campuses, {f["students"]} students reassigned to "unassigned"'
            for fid, f in internal.items()) + f"   [{before - len(facs)} facilitator row(s) removed]")

    # A campus name only identifies a school if it is unique. On 2026-09-17 the source
    # stopped carrying the "- متوسط - بنين" suffixes on campus_name, leaving 12 names
    # shared by 29 campuses — which makes every ticket ambiguous about WHICH school it
    # means, the one thing these tickets exist to say. Re-append school level + gender,
    # but ONLY where the bare name repeats, so unique names stay short.
    LVL = {"MIDDLE_SCHOOL": "متوسط", "HIGH_SCHOOL": "ثانوي"}
    GEN = {"BOYS": "بنين", "MALE": "بنين", "GIRLS": "بنات", "FEMALE": "بنات", "COED": "مشترك"}
    repeated = collections.Counter(c["name"] for c in campuses)
    for c in campuses:
        if repeated[c["name"]] > 1:
            bits = [x for x in (LVL.get(c.get("lvl")), GEN.get(c.get("gen"))) if x]
            if bits:
                c["name"] = c["name"] + " - " + " - ".join(bits)
        c.pop("lvl", None); c.pop("gen", None)
    still_shared = [n for n, k in collections.Counter(c["name"] for c in campuses).items() if k > 1]

    # ---- exams are measured against the students each exam is ASSIGNED to ---------------
    # xn = eligible students (assigned cohort / programme / already sat). A school with fewer
    # than MIN_ELIGIBLE eligible students for an exam is treated as "not assigned": 1-4 stray
    # students (a transfer, a one-off enrolment) do not make it a Qudrat/ESL/... school, and
    # judging the school on them would raise a ticket about noise.
    EXAM_BIT = {"q": 2, "e": 4, "t": 8, "s": 32, "m": 64, "p": 128}
    EXAM_FIELDS = {"q": ("qn", "qo", "qc", "qs"), "e": ("en", "eo", "ec", "es"),
                   "t": ("tn", "to", "tc", "ts"), "s": ("sn", "so", "sc", "ss"),
                   "m": ("mn", "mo", "mc", "ms"), "p": ("pn", "po", "pc", "ps")}
    MIN_ELIGIBLE = 5
    dropped = []
    for e in exams:
        for x, fields in EXAM_FIELDS.items():
            if (e.get(fields[0]) or 0) < MIN_ELIGIBLE:
                if e.get(fields[0]): dropped.append((e["id"], x, e[fields[0]]))
                e[fields[0]] = 0
                for f in fields[1:]: e[f] = None
    thin = {(cid, EXAM_BIT[x]) for cid, x, _ in dropped}
    for st in students_raw:
        for cid, bit in thin:
            if st["c"] == cid: st["x"] &= ~bit
    students_raw = [st for st in students_raw if st["x"] > 0]
    live_ids = {c["id"] for c in campuses}
    exams = [e for e in exams if e["id"] in live_ids
             and any(e[f[0]] for f in EXAM_FIELDS.values())]
    bygrade_raw = [b for b in bygrade_raw if (b["id"], b["ex"].lower()) not in
                   {(cid, x) for cid, x, _ in dropped} and b["id"] in live_ids]
    win = {w["ex"].lower(): {"from": w["s"][:10], "to": w["e"][:10]} for w in windows_raw}

    term = dt.date.fromisoformat(a.term)
    start, end = (a.window if a.window else (a.term, dt.date.today().isoformat()))

    live = {c["id"] for c in campuses}
    leads = [{"lid": l["lid"], "name": l["name"], "cid": l["cid"]}
             for l in leads_raw if l["cid"] in live and l["name"] not in TEST_ACCOUNTS]

    grades  = sorted({s["g"] for s in students_raw if s["g"]} | {b["g"] for b in bygrade_raw if b["g"]})
    cohorts = sorted({s["k"] for s in students_raw if s["k"]})
    gi = {v: i for i, v in enumerate(grades)}
    ci = {v: i for i, v in enumerate(cohorts)}
    students = [[s["n"], s["c"], gi.get(s["g"], 0), ci.get(s["k"], 0), s["f"], s["x"]] for s in students_raw]
    students.sort(key=lambda r: (-bin(r[5]).count("1"), r[1], r[0]))
    # [campus, grade index, exam, assigned, opened, completed, score%] — rows sum to the campus's exam total
    bygrade = [[b["id"], gi.get(b["g"], 0), b["ex"].lower(), b["n"], b["o"], b["c"], b["s"]] for b in bygrade_raw]

    # trust comments. Cohorts here can include groups absent from the gap list, so the
    # dictionary is EXTENDED, never rebuilt — student rows reference it by index.
    RATE = ["VERY_BAD", "BAD", "OK", "GOOD", "EXCELLENT"]
    def cidx(k):
        if k not in ci:
            ci[k] = len(cohorts); cohorts.append(k)
        return ci[k]
    comments = [[x["c"], x["f"], cidx(x["k"]), x["w"], 1 if x["q"] == "A" else 0,
                 RATE.index(x["r"]), x["t"]]
                for x in comments_raw if x.get("r") in RATE and (x.get("t") or "").strip()]
    comments.sort(key=lambda r: (r[5], -r[3]))          # worst rating first, newest week first

    wks = sorted({w["wk"] for w in weekly})
    week_meta = [{"wk": w, "from": (term + dt.timedelta(days=7*(w-1))).isoformat(),
                  "to": (term + dt.timedelta(days=7*(w-1)+6)).isoformat()} for w in wks]

    # ---- sanity checks: a bad extract must fail loudly, not publish quietly ----
    enr = sum(c["enr"] for c in campuses)
    errs = []
    if not campuses:                errs.append("no campuses returned")
    if still_shared:
        errs.append(f"{len(still_shared)} campus name(s) shared by more than one school even "
                    f"after adding level+gender — tickets would be ambiguous: {still_shared[:3]}")
    if not weekly:                  errs.append("no weekly rows — the series would be empty")
    if any(not c["mgr"] for c in campuses):
        errs.append(f"{sum(1 for c in campuses if not c['mgr'])} campuses have no manager")
    for x, fields in EXAM_FIELDS.items():
        if x in ("q", "e", "t") and not any((e.get(fields[1]) or 0) > 0 for e in exams):
            errs.append(f"no campus has any participation in exam '{x}' — exam titles in "
                        "00_common.sql have probably been renamed for a new intake")
    if not exams:                   errs.append("no exam is assigned to any campus")
    if not simgrades_raw:           errs.append("no diagnostic/simulator attempts returned by 07_sim_grades.sql")
    _bg = collections.Counter()
    for b in bygrade: _bg[(b[0], b[2])] += b[3]
    for e in exams:
        for x, fields in EXAM_FIELDS.items():
            if (e.get(fields[0]) or 0) != _bg.get((e["id"], x), 0):
                errs.append(f"by-grade split does not add up to the exam total for campus {e['id']} exam '{x}' "
                            f"({_bg.get((e['id'], x), 0)} vs {e.get(fields[0]) or 0}) — the two columns of 02_exams.sql "
                            "must come from ONE query run")
                break
    for key, label in (("att", "attendance"), ("etq", "exit-ticket correctness")):
        if all(c.get(key) is None for c in campuses):
            errs.append(f"{label} is null network-wide")
    if prev:
        pe = sum(c["enr"] for c in prev.get("campuses", []))
        if pe and abs(enr - pe) / pe > 0.20:
            errs.append(f"student total moved {100*(enr-pe)/pe:+.0f}% ({pe:,} -> {enr:,})")
        pc = len(prev.get("campuses", []))
        if pc and len(campuses) < pc * 0.9:
            errs.append(f"campus count dropped {pc} -> {len(campuses)}")
    if errs and not a.force:
        print("REFUSING TO WRITE — sanity checks failed:")
        for e in errs: print("  ✗", e)
        sys.exit(1)
    for e in errs: print("  ! (forced past)", e)

    data = {
        "meta": {
            "source": "Athena · noon2_datamart / noon2_core",
            "rules_version": a.rules or (prev or {}).get("meta", {}).get("rules_version", "unknown"),
            "pulled_at": dt.date.today().isoformat(),
            "window_start": start, "window_end": end,
            "school_year": "2026/2027", "term_start": a.term,
            "scope": "Saudi Arabia · TRACKS + UFFUQ campuses that have a SCHOOL_MANAGER (role PRINCIPAL)",
            "weeks": week_meta,
            "exam_windows": win,
        },
        "managers": sorted({w["mid"]: {"id": w["mid"], "name": w["mname"]} for w in weekly}.values(),
                           key=lambda m: m["id"]),
        "campuses": campuses, "exams": exams,
        "weekly": [{k: w[k] for k in ("mid", "wk", "act", "att", "etq", "etn", "tn", "tr")} for w in weekly],
        "facilitators": facs, "leads": leads,
        "bygrade": bygrade,
        "simgrades": [[x["pr"], x["ty"], x["p"], x["g"], x["a"], x["n"]] for x in simgrades_raw],
        "grades": grades, "cohorts": cohorts, "students": students, "comments": comments,
        "orphanCohorts": [{"c": o["c"], "k": o["k"], "f": o["f"], "fn": o["fn"], "n": o["n"],
                           "w": o.get("w", "D")} for o in orphans],
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    for script in ("build.py", "build_press.py"):
        r = subprocess.run([sys.executable, script], cwd=ROOT, capture_output=True, text=True)
        if r.returncode: sys.exit(f"{script} failed:\n{r.stdout}{r.stderr}")

    nolead = [c for c in campuses if c["id"] not in {l["cid"] for l in leads}]
    flags = {k: sum(1 for st in students if st[5] & b)
             for k, b in (("never attended", 1), ("Qudrat", 2), ("ESL", 4), ("Tahsili", 8),
                          ("NAFES Science", 32), ("NAFES Math+Arabic", 64), ("3rd-intermediate", 128))}
    print(f"window        {start} -> {end}   weeks {wks}")
    nq = sum(1 for c in campuses if " - " in c["name"])
    if nq: print(f"names       {nq:>4} campus names disambiguated with level+gender (shared bare name)")
    print(f"campuses {len(campuses):>4}   students {enr:>6,}   facilitators {len(facs):>4}   leads {len(leads):>3}")
    print(f"gap students  {len(students):>4}   " + " · ".join(f"{k} {v}" for k, v in flags.items()))
    neg = sum(1 for r in comments if r[5] <= 2)
    od = sum(1 for o in orphans if o.get("w", "D") == "D"); oi = len(orphans) - od
    print(f"no lead  {len(nolead):>4}   orphan cohorts {len(orphans)} ({od} deleted profile · {oi} placeholder account)")
    print(f"comments {len(comments):>4}   {neg} needing attention")
    for x, fields in EXAM_FIELDS.items():
        el = [e for e in exams if e[fields[0]]]
        n = sum(e[fields[0]] for e in el)
        opened = sum(e[fields[0]] * (e[fields[1]] or 0) / 100 for e in el)
        print(f"exam {x.upper()}    {len(el):>3} schools assigned · {n:>5,} eligible · {100*opened/n if n else 0:4.0f}% opened"
              f"   window {win.get(x, {}).get('from', '?')} -> {win.get(x, {}).get('to', '?')}")
    if dropped:
        print(f"thin        {len(dropped)} school/exam pairs under {MIN_ELIGIBLE} eligible students ignored as noise")
    if prev:
        pe = sum(c["enr"] for c in prev.get("campuses", []))
        print(f"vs last run   students {pe:,} -> {enr:,} ({100*(enr-pe)/pe:+.1f}%)" if pe else "")
    print("built: manager-dashboard.html · dist/artifact.html · press/ (25 files)")


if __name__ == "__main__":
    main()
