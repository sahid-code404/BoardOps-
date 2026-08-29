import app from "./index";
import { operationsRouter } from "./meals";

app.route("/api/v1", operationsRouter);

export default app;
