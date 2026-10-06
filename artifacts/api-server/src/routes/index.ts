import { Router, type IRouter } from "express";
import healthRouter from "./health";
import synapseRouter from "./synapse";
import dashboardRouter from "./dashboard";
import dashboardAuthRouter from "./dashboard-auth";
import dashboardSyncRouter from "./dashboard-sync";

const router: IRouter = Router();

router.use(healthRouter);
router.use(synapseRouter);
router.use(dashboardRouter);
router.use(dashboardAuthRouter);
router.use(dashboardSyncRouter);

export default router;
