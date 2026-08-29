import { motion } from "framer-motion";
import { Database, ShieldCheck, Sparkles } from "lucide-react";
import { Route, Routes } from "react-router-dom";

const cards = [
  {
    icon: ShieldCheck,
    title: "Audit before migration",
    body: "The legacy repository is reference-only. Behavior, accounting rules and risks are being documented before feature work.",
  },
  {
    icon: Database,
    title: "D1 + R2 foundation",
    body: "The Worker has local D1 and R2 bindings. No production data or committed binary database is used.",
  },
  {
    icon: Sparkles,
    title: "Visual DNA preserved",
    body: "Glass, motion and premium interaction are product requirements. Optimization will target implementation cost, not remove the experience.",
  },
];

function FoundationHome() {
  return (
    <main className="app-shell">
      <div className="ambient ambient-a" aria-hidden="true" />
      <div className="ambient ambient-b" aria-hidden="true" />
      <motion.section
        className="hero glass-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="eyebrow">BOARDOPS REWRITE</div>
        <h1>Foundation first. Accounting correctness always.</h1>
        <p>
          Phase 00 and Phase 01 are establishing the Cloudflare architecture and a verified source audit.
          Financial features are intentionally not implemented until those gates pass.
        </p>
        <div className="status-row" role="status" aria-label="Implementation status">
          <span>Phase 00 · In progress</span>
          <span>Phase 01 · In progress</span>
          <span>No production deployment</span>
        </div>
      </motion.section>

      <section className="card-grid" aria-label="Foundation principles">
        {cards.map(({ icon: Icon, title, body }, index) => (
          <motion.article
            className="glass-card"
            key={title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * index, duration: 0.28 }}
          >
            <Icon size={20} aria-hidden="true" />
            <h2>{title}</h2>
            <p>{body}</p>
          </motion.article>
        ))}
      </section>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="*" element={<FoundationHome />} />
    </Routes>
  );
}
