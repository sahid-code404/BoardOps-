import app from "./index";
import { operationsRouter } from "./meals";
import { mealOperationsRouter } from "./meal-operations";

app.route("/api/v1", operationsRouter);
app.route("/api/v1", mealOperationsRouter);

export default app;
