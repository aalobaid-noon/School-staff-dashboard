import { Router, type IRouter } from "express";
import { GetSynapseStatusResponse } from "@workspace/api-zod";
import { getSynapseStatus } from "../lib/synapse";

const router: IRouter = Router();

// This endpoint exposes connection state only, not school records, SQL, or credentials.
router.get("/synapse/status", async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.json(GetSynapseStatusResponse.parse(await getSynapseStatus()));
});

export default router;
