"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ALL_LIFTS,
  COMPOUNDS,
  EXTRAS,
  NEXT_WORKOUT,
  PATTERN_META,
  signed,
  type LiftId,
  type PatternId,
  type SampleLift,
} from "./data";
import { IconClose, IconHistory, IconMenu, IconPin, IconPlay, IconSwap, Sparkline } from "./icons";

type Screen = "atlas" | "pattern" | "session" | "menu";

const ORDER: PatternId[] = [
  "squat",
  "hinge",
  "horizontal_press",
  "vertical_press",
  "horizontal_pull",
  "vertical_pull",
];

export function VariantB({
  onState,
}: {
  onState: (state: Record<string, unknown>) => void;
}) {
  const [screen, setScreen] = useState<Screen>("atlas");
  const [watch, setWatch] = useState<LiftId[]>([]);
  const [pattern, setPattern] = useState<PatternId>("horizontal_press");
  const [index, setIndex] = useState(0);
  const [logged, setLogged] = useState(false);
  const [picking, setPicking] = useState(false);

  const sessionLifts = NEXT_WORKOUT.exercises;
  const current = sessionLifts[index];

  useEffect(() => {
    onState({
      variant: "B Atlas",
      screen,
      watch,
      pattern,
      sessionIndex: index,
      loggedSet: logged,
      picking,
    });
  }, [screen, watch, pattern, index, logged, picking, onState]);

  function toggleWatch(id: LiftId) {
    setWatch((currentWatch) =>
      currentWatch.includes(id) ? currentWatch.filter((item) => item !== id) : [...currentWatch, id],
    );
  }

  return (
    <div className="b">
      {screen === "atlas" && (
        <>
          <div className="status-bar"><span>6:14</span><span>Atlas</span></div>
          <div className="b-top">
            <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setScreen("menu")}><IconMenu /></button>
            <strong style={{ letterSpacing: "-0.03em" }}>Strength map</strong>
            <span style={{ width: "2.75rem" }} />
          </div>
          <div className="b-watch">
            {watch.length === 0 && (
              <button type="button" className="add" onClick={() => setPicking(true)}>+ Watch a lift</button>
            )}
            {watch.map((id) => {
              const lift = ALL_LIFTS.find((item) => item.id === id);
              if (!lift) return null;
              return (
                <button key={id} type="button" onClick={() => toggleWatch(id)}>
                  {lift.short} {lift.e1rm}
                </button>
              );
            })}
            {watch.length > 0 && (
              <button type="button" className="add" onClick={() => setPicking(true)}>+</button>
            )}
          </div>
          <div className="b-body">
            {ORDER.map((id) => {
              const meta = PATTERN_META[id];
              const lift = COMPOUNDS.find((item) => item.id === meta.compoundId)!;
              return (
                <button
                  key={id}
                  type="button"
                  className={`b-band ${id}`}
                  onClick={() => {
                    setPattern(id);
                    setScreen("pattern");
                  }}
                >
                  <span className="mark">{meta.mark}</span>
                  <span>
                    <span className="name">{meta.label}</span>
                    <span className="sub">{lift.name}</span>
                  </span>
                  <span>
                    <span className="num">{lift.e1rm}</span>
                    <span className="sub" style={{ display: "block", textAlign: "right", color: lift.recentPr ? "#9a3412" : undefined }}>
                      {lift.recentPr ? "PR" : lift.delta === 0 ? "held" : signed(lift.delta)}
                    </span>
                  </span>
                </button>
              );
            })}
            <div style={{ height: "5rem" }} />
          </div>
          <button type="button" className="b-fab" onClick={() => { setIndex(0); setLogged(false); setScreen("session"); }}>
            <IconPlay size={18} /> Start {NEXT_WORKOUT.day}
          </button>
        </>
      )}

      {screen === "pattern" && <PatternDetail pattern={pattern} watch={watch} onWatch={toggleWatch} onBack={() => setScreen("atlas")} />}

      {screen === "menu" && (
        <div className="b-session">
          <div className="status-bar"><span>6:14</span><span>Menu</span></div>
          <header>
            <button type="button" className="icon-btn" onClick={() => setScreen("atlas")} aria-label="Close menu"><IconClose /></button>
            <strong>More</strong>
            <span style={{ width: "2.75rem" }} />
          </header>
          <div style={{ padding: "1rem" }}>
            {[
              ["Program", NEXT_WORKOUT.program],
              ["Month review", "August"],
              ["Coach", "3 notes"],
              ["Weight", "182.4 lb"],
              ["Settings", "Rest, units"],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "0.9rem 0", borderBottom: "1px solid #e7e5e4" }}>
                <b>{label}</b>
                <span style={{ color: "#78716c" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {screen === "session" && (
        <div className="b-session">
          <div className="status-bar"><span>6:14</span><span>{index + 1} / {sessionLifts.length}</span></div>
          <header>
            <button type="button" className="icon-btn" onClick={() => setScreen("atlas")}>Close</button>
            <span style={{ fontSize: "0.75rem", color: "#78716c" }}>{NEXT_WORKOUT.day}</span>
            <span />
          </header>
          <p className="pattern">{current.name.includes("Bench") ? "Horizontal press" : "Next lift"}</p>
          <h2>{current.name.replace("Barbell ", "")}</h2>
          <div className="giant">
            <b>{current.target.split(" ")[0]}</b>
            <em>{current.target.includes("×") ? current.target.slice(current.target.indexOf("×")) : current.rx}</em>
          </div>
          <div className="row-actions">
            <button type="button" className="icon-btn" aria-label="Swap"><IconSwap /></button>
            <button type="button" className="icon-btn" aria-label="History"><IconHistory /></button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Pin"
              onClick={() => current.id && toggleWatch(current.id as LiftId)}
            >
              <IconPin filled={typeof current.id === "string" && watch.includes(current.id as LiftId)} />
            </button>
          </div>
          <div className="b-pager">
            {sessionLifts.map((item, i) => <i key={item.name} className={i === index ? "on" : ""} />)}
          </div>
          <footer>
            <button type="button" className="ghost" onClick={() => { setIndex((i) => Math.max(0, i - 1)); setLogged(false); }}>Prev</button>
            <button type="button" className="log" onClick={() => setLogged(true)}>{logged ? "PR logged" : "Log set"}</button>
            <button type="button" className="ghost" onClick={() => { setIndex((i) => Math.min(sessionLifts.length - 1, i + 1)); setLogged(false); }}>Next</button>
          </footer>
        </div>
      )}

      {picking && (
        <>
          <button type="button" className="phone-scrim" aria-label="Close" onClick={() => setPicking(false)} />
          <div className="phone-sheet">
            <div className="handle" />
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Watchlist</h2>
            <p style={{ color: "#78716c", fontSize: "0.8rem", marginBottom: "0.6rem" }}>These sit above the map. The map itself stays the six compounds.</p>
            {[...COMPOUNDS, ...EXTRAS].map((lift) => (
              <button
                key={lift.id}
                type="button"
                onClick={() => toggleWatch(lift.id)}
                style={{
                  display: "flex",
                  width: "100%",
                  justifyContent: "space-between",
                  padding: "0.7rem 0",
                  border: 0,
                  borderBottom: "1px solid #e7e5e4",
                  background: "transparent",
                  font: "inherit",
                  cursor: "pointer",
                }}
              >
                <span>{lift.name}</span>
                <IconPin filled={watch.includes(lift.id)} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PatternDetail({
  pattern,
  watch,
  onWatch,
  onBack,
}: {
  pattern: PatternId;
  watch: LiftId[];
  onWatch: (id: LiftId) => void;
  onBack: () => void;
}) {
  const meta = PATTERN_META[pattern];
  const lifts = useMemo(
    () => ALL_LIFTS.filter((lift) => lift.pattern === pattern || (pattern === "vertical_pull" && lift.id === "lat-pulldown")),
    [pattern],
  );

  return (
    <div className="b-session">
      <div className="status-bar"><span>6:14</span><span>{meta.label}</span></div>
      <header>
        <button type="button" className="icon-btn" onClick={onBack}>Back</button>
        <strong>{meta.label}</strong>
        <span style={{ width: "2.75rem" }} />
      </header>
      <div style={{ padding: "0.4rem 1.1rem 1rem" }}>
        <p style={{ color: "#78716c", fontSize: "0.8rem", marginBottom: "0.8rem" }}>
          One pattern, every variant. Pin the one you actually care about tracking.
        </p>
        {lifts.map((lift: SampleLift) => (
          <div key={lift.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.6rem", alignItems: "center", padding: "0.85rem 0", borderBottom: "1px solid #e7e5e4" }}>
            <div>
              <b>{lift.name}</b>
              <div style={{ color: "#78716c", fontSize: "0.75rem" }}>{lift.e1rm} {lift.unit} · {lift.delta === 0 ? "held" : signed(lift.delta)}</div>
            </div>
            <Sparkline values={lift.spark} color="#1c1917" />
            <button type="button" className="icon-btn" aria-label={`Watch ${lift.short}`} onClick={() => onWatch(lift.id)}>
              <IconPin filled={watch.includes(lift.id)} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
