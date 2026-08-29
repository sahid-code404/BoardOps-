import app from "./index";
import { accountingRouter } from "./accounting";
import { calendarArchiveRouter } from "./calendar-archive";
import { calendarGuardRouter, calendarRouter } from "./calendar";
import { communicationsRouter } from "./communications";
import { mealOperationsRouter } from "./meal-operations";
import { operationsRouter } from "./meals";
import { paymentReviewRouter } from "./payment-review";

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

// Product-facing payment routes preserve the resident submission -> admin review
// workflow. The lower-level accounting router remains the canonical ledger/fund
// implementation and owns /funds/* endpoints.
app.route("/api/v1", paymentReviewRouter);
app.route("/api/v1", accountingRouter);

export default app;
