import { Router, type IRouter } from "express";
import healthRouter from "./health";
import synapseRouter from "./synapse";

const router: IRouter = Router();

router.use(healthRouter);
router.use(synapseRouter);

export default router;
