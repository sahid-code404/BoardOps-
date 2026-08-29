import app from "./index";
import { calendarArchiveRouter } from "./calendar-archive";
import { calendarGuardRouter, calendarRouter } from "./calendar";
import { communicationsRouter } from "./communications";
import { mealOperationsRouter } from "./meal-operations";
import { operationsRouter } from "./meals";

// Calendar guards run before meal mutation routers so a meal-service closure is
// enforced at the API boundary as well as by D1 triggers.
app.route("/api/v1", calendarGuardRouter);
app.route("/api/v1", operationsRouter);
app.route("/api/v1", mealOperationsRouter);

// The archive route is mounted before the general calendar router so the
// explicit, transactionally-restored implementation owns DELETE requests.
app.route("/api/v1", calendarArchiveRouter);
app.route("/api/v1", calendarRouter);
app.route("/api/v1", communicationsRouter);

export default app;
