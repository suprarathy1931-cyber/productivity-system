// =====================================================================
// Breath Log — module page
// =====================================================================
// Matches the 5-phase routine from your original breathing doc:
// Kapalabhati -> Anulom Vilom -> Box Breathing -> Static Hold -> Recovery.
// The static hold duration is the one number worth surfacing
// prominently (it's the metric you track week over week and the one
// the Roadmap milestone resolver watches), everything else is
// logged but not front-and-center.

import { useState } from "react";
import {
  useBreathSessions,
  useLatestBreathHold,
  createBreathSession,
  type BreathSessionInput,
} from "./useBreathSessions";

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export function BreathLogPage() {
  const sessions = useBreathSessions();
  const latestHold = useLatestBreathHold();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="module-page">
      <header className="module-header">
        <div>
          <h1>Breath Log</h1>
          {latestHold != null && (
            <p className="module-subtitle">
              Latest hold: <strong>{latestHold}s</strong>
            </p>
          )}
        </div>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Log Session"}
        </button>
      </header>

      {showForm && (
        <LogSessionForm
          onSaved={() => setShowForm(false)}
        />
      )}

      <SessionHistory sessions={sessions} />
    </div>
  );
}

function LogSessionForm({ onSaved }: { onSaved: () => void }) {
  const [entryDate, setEntryDate] = useState(todayIso());
  const [holdDuration, setHoldDuration] = useState("");
  const [holdExhalePct, setHoldExhalePct] = useState("30");
  const [kapalabhatiRounds, setKapalabhatiRounds] = useState("3");
  const [anulomVilomCycles, setAnulomVilomCycles] = useState("10");
  const [boxBreathingCycles, setBoxBreathingCycles] = useState("8");
  const [recoveryCycles, setRecoveryCycles] = useState("10");
  const [feltDizzy, setFeltDizzy] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const input: BreathSessionInput = {
      entry_date: entryDate,
      hold_duration_seconds: holdDuration ? Number(holdDuration) : undefined,
      hold_exhale_pct: holdExhalePct ? Number(holdExhalePct) : undefined,
      kapalabhati_rounds: kapalabhatiRounds ? Number(kapalabhatiRounds) : undefined,
      anulom_vilom_cycles: anulomVilomCycles ? Number(anulomVilomCycles) : undefined,
      box_breathing_cycles: boxBreathingCycles ? Number(boxBreathingCycles) : undefined,
      recovery_cycles: recoveryCycles ? Number(recoveryCycles) : undefined,
      felt_dizzy: feltDizzy ? 1 : 0,
      notes: notes || undefined,
    };

    await createBreathSession(input);
    setSaving(false);
    onSaved();
  };

  return (
    <form className="log-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Date
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            required
          />
        </label>
      </div>

      <div className="form-row form-row-highlight">
        <label>
          Static hold — seconds
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 58"
            value={holdDuration}
            onChange={(e) => setHoldDuration(e.target.value)}
            autoFocus
          />
        </label>
        <label>
          Exhaled before hold (%)
          <input
            type="number"
            inputMode="numeric"
            value={holdExhalePct}
            onChange={(e) => setHoldExhalePct(e.target.value)}
          />
        </label>
      </div>

      <details className="form-details">
        <summary>Full routine (optional)</summary>
        <div className="form-row">
          <label>
            Kapalabhati rounds
            <input
              type="number"
              inputMode="numeric"
              value={kapalabhatiRounds}
              onChange={(e) => setKapalabhatiRounds(e.target.value)}
            />
          </label>
          <label>
            Anulom Vilom cycles
            <input
              type="number"
              inputMode="numeric"
              value={anulomVilomCycles}
              onChange={(e) => setAnulomVilomCycles(e.target.value)}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Box breathing cycles
            <input
              type="number"
              inputMode="numeric"
              value={boxBreathingCycles}
              onChange={(e) => setBoxBreathingCycles(e.target.value)}
            />
          </label>
          <label>
            Recovery cycles
            <input
              type="number"
              inputMode="numeric"
              value={recoveryCycles}
              onChange={(e) => setRecoveryCycles(e.target.value)}
            />
          </label>
        </div>
      </details>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={feltDizzy}
          onChange={(e) => setFeltDizzy(e.target.checked)}
        />
        Felt dizzy during session
      </label>

      <label>
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional"
        />
      </label>

      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? "Saving..." : "Save Session"}
      </button>
    </form>
  );
}

function SessionHistory({
  sessions,
}: {
  sessions: ReturnType<typeof useBreathSessions>;
}) {
  if (sessions.length === 0) {
    return <p className="empty-state">No sessions logged yet.</p>;
  }

  return (
    <div className="session-history">
      <h2>History</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Hold (s)</th>
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>{s.entry_date}</td>
              <td>{s.hold_duration_seconds ?? "—"}</td>
              <td className="notes-cell">{s.notes ?? ""}</td>
              <td>
                {s.sync_status === "pending" && (
                  <span className="sync-badge" title="Not yet synced to server">
                    ⏳
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
