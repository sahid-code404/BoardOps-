import app from "./index";
import { calendarGuardRouter, calendarRouter } from "./calendar";
import { mealOperationsRouter } from "./meal-operations";
import { operationsRouter } from "./meals";

// Calendar guards run before meal mutation routers so a meal-service closure is
// enforced at the API boundary as well as by D1 triggers.
app.route("/api/v1", calendarGuardRouter);
app.route("/api/v1", operationsRouter);
app.route("/api/v1", mealOperationsRouter);
app.route("/api/v1", calendarRouter);

export default app;
