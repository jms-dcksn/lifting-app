"use client";

import { useEffect, useState } from "react";
import { COMPOUNDS, EXTRAS, FEED, NEXT_WORKOUT, WEEK_RECORDS, liftById, type LiftId } from "./data";
import { IconPin, IconUser } from "./icons";

type Screen = "today" | "program" | "recap" | "you";
type Overlay = null | "pins" | "plan" | "detail";

export function VariantC({
  onState,
}: {
  onState: (state: Record<string, unknown>) => void;
}) {
  const [screen, setScreen] = useState<Screen>("today");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [ticker, setTicker] = useState<LiftId[]>(["bb-bench", "bb-back-squat", "bb-deadlift"]);
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    onState({
      variant: "C Pulse",
      screen,
      overlay,
      ticker,
      detail,
    });
  }, [screen, overlay, ticker, detail, onState]);

  function toggleTicker(id: LiftId) {
    setTicker((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 4) return [...current.slice(1), id];
      return [...current, id];
    });
  }

  return (
    <div className="c">
      {screen === "today" && (
        <>
          <div className="status-bar"><span>6:14</span><span>Pulse</span></div>
          <div className="c-top">
            <h1>Today</h1>
            <button type="button" className="icon-btn" aria-label="You" onClick={() => setScreen("you")}><IconUser /></button>
          </div>
          <button type="button" className="c-ticket" onClick={() => setOverlay("plan")}>
            <span>
              <b>Start Push</b>
              <span>18 sets · week 4</span>
            </span>
            <span style={{ fontWeight: 800 }}>→</span>
          </button>
          <div className="c-ticker">
            {ticker.map((id) => {
              const lift = liftById(id);
              if (!lift) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setDetail(id);
                    setOverlay("detail");
                  }}
                >
                  <div className="l">{lift.short}</div>
                  <div className="n">{lift.e1rm}</div>
                </button>
              );
            })}
            <button type="button" onClick={() => setOverlay("pins")}>
              <div className="l">Pin</div>
              <div className="n">+</div>
            </button>
          </div>
          <div className="c-feed">
            {FEED.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`c-item${item.kind === "pr" ? " pr" : ""}`}
                onClick={() => {
                  if (item.kind === "session") {
                    setScreen("recap");
                    return;
                  }
                  setDetail(item.id);
                  setOverlay("detail");
                }}
              >
                <span className="spine"><i className="dot" /></span>
                <span className="body">
                  <span className="k">{item.when} · {item.kind}</span>
                  <h3>{item.title}</h3>
                  <p>{item.value} {item.delta}</p>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {screen === "program" && (
        <>
          <div className="status-bar"><span>6:14</span><span>Program</span></div>
          <div className="c-top"><h1>Program</h1></div>
          <div style={{ padding: "0 1.1rem", color: "#a8a29e" }}>
            <p style={{ fontSize: "1.1rem", color: "#f5f0e6", marginBottom: "0.8rem" }}>{NEXT_WORKOUT.program}</p>
            {["Push", "Pull", "Legs", "Upper"].map((day) => (
              <p key={day} style={{ display: "flex", justifyContent: "space-between", padding: "0.85rem 0", borderTop: "1px solid #1c1917" }}>
                <b style={{ color: "#f5f0e6" }}>{day}</b>
                <span>{day === "Push" ? "tonight" : "queued"}</span>
              </p>
            ))}
          </div>
        </>
      )}

      {screen === "you" && (
        <>
          <div className="status-bar"><span>6:14</span><span>You</span></div>
          <div className="c-top"><h1>You</h1></div>
          <div style={{ padding: "0 1.1rem" }}>
            {[
              ["Weight", "182.4 lb"],
              ["Coach notes", "3"],
              ["Rest", "2:00"],
              ["Sign out", ""],
            ].map(([label, value]) => (
              <p key={label} style={{ display: "flex", justifyContent: "space-between", padding: "0.9rem 0", borderTop: "1px solid #1c1917" }}>
                <span>{label}</span>
                <span style={{ color: "#a8a29e" }}>{value}</span>
              </p>
            ))}
          </div>
        </>
      )}

      {screen === "recap" && (
        <div className="c-recap phone-modal">
          <p className="eyebrow">Workout recap</p>
          <h2>2 PRs</h2>
          <ul>
            {WEEK_RECORDS.map((record) => (
              <li key={record.id}>
                <span>{record.name}</span>
                <span style={{ color: "#e8c36a" }}>{record.detail}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setScreen("today")}
            style={{ marginTop: "2rem", width: "100%", height: "3rem", border: 0, borderRadius: "999px", background: "#f5f0e6", color: "#111", fontWeight: 700, cursor: "pointer" }}
          >
            Back to today
          </button>
        </div>
      )}

      {screen !== "recap" && (
        <nav className="c-dock">
          <button type="button" className={screen === "today" ? "on" : ""} onClick={() => setScreen("today")}>Today</button>
          <button type="button" className={screen === "program" ? "on" : ""} onClick={() => setScreen("program")}>Program</button>
        </nav>
      )}

      {overlay && (
        <>
          <button type="button" className="phone-scrim" aria-label="Close" onClick={() => { setOverlay(null); setDetail(null); }} />
          <div className="phone-sheet">
            <div className="handle" />
            {overlay === "plan" && (
              <>
                <h2 style={{ fontSize: "1.2rem" }}>Push</h2>
                {NEXT_WORKOUT.exercises.map((item) => (
                  <p key={item.name} style={{ display: "flex", justifyContent: "space-between", padding: "0.7rem 0", borderBottom: "1px solid #292524" }}>
                    <span>{item.name}</span>
                    <span style={{ color: "#a8a29e" }}>{item.rx}</span>
                  </p>
                ))}
                <button
                  type="button"
                  onClick={() => { setOverlay(null); setScreen("recap"); }}
                  style={{ marginTop: "1rem", width: "100%", height: "3rem", border: 0, borderRadius: "999px", background: "#e8c36a", color: "#111", fontWeight: 800, cursor: "pointer" }}
                >
                  Start
                </button>
              </>
            )}
            {overlay === "pins" && (
              <>
                <h2 style={{ fontSize: "1.2rem" }}>Ticker</h2>
                <p style={{ color: "#a8a29e", fontSize: "0.8rem", margin: "0.3rem 0 0.6rem" }}>Four numbers, always on Today. Oldest drops off when you add a fifth.</p>
                {[...COMPOUNDS, ...EXTRAS].map((lift) => (
                  <button
                    key={lift.id}
                    type="button"
                    onClick={() => toggleTicker(lift.id)}
                    style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", padding: "0.7rem 0", border: 0, borderBottom: "1px solid #292524", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer" }}
                  >
                    <span>{lift.short}</span>
                    <span style={{ color: ticker.includes(lift.id) ? "#e8c36a" : "#a8a29e", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      {lift.e1rm}
                      <IconPin filled={ticker.includes(lift.id)} />
                    </span>
                  </button>
                ))}
              </>
            )}
            {overlay === "detail" && <Detail detail={detail} />}
          </div>
        </>
      )}
    </div>
  );
}

function Detail({ detail }: { detail: string | null }) {
  const lift = detail ? liftById(detail) : null;
  const feed = FEED.find((item) => item.id === detail);
  const subject = lift ?? (feed?.liftId ? liftById(feed.liftId) : null);

  if (feed?.kind === "stall") {
    return (
      <>
        <h2 style={{ fontSize: "1.2rem" }}>Worth a look</h2>
        <p style={{ color: "#a8a29e", marginTop: "0.4rem" }}>Row hasn’t set a new e1RM in 21 days. This is a note, not a program change.</p>
      </>
    );
  }
  if (feed?.kind === "weight") {
    return (
      <>
        <h2 style={{ fontSize: "1.2rem" }}>Weight</h2>
        <p style={{ fontSize: "2rem", margin: "0.4rem 0" }}>182.4</p>
        <p style={{ color: "#a8a29e" }}>Logged from the calendar — not a home-screen job.</p>
      </>
    );
  }
  return (
    <>
      <p style={{ color: "#e8c36a", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.7rem", fontWeight: 800 }}>
        {subject?.recentPr ? "PR" : "Lift"}
      </p>
      <h2 style={{ fontSize: "1.6rem", margin: "0.25rem 0 0.4rem" }}>{subject?.name ?? feed?.title}</h2>
      <p style={{ fontSize: "2.2rem", fontWeight: 650 }}>{subject?.e1rm ?? feed?.value}</p>
      <p style={{ color: "#a8a29e", marginTop: "0.4rem" }}>{feed?.delta ?? "Current best"}</p>
      <p style={{ color: "#a8a29e", marginTop: "0.8rem", fontSize: "0.85rem" }}>
        Full history, Coach notes, and month charts stay one tap behind this number.
      </p>
    </>
  );
}
