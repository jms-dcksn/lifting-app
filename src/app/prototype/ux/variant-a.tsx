"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ALL_LIFTS,
  COMPOUNDS,
  EXTRAS,
  NEXT_WORKOUT,
  WEEK_RECORDS,
  signed,
  type LiftId,
  type SampleLift,
} from "./data";
import {
  IconCalendar,
  IconGrid,
  IconHistory,
  IconInfo,
  IconPin,
  IconPlay,
  IconProgram,
  IconScale,
  IconSpark,
  IconSwap,
  IconUser,
  Sparkline,
} from "./icons";

type Tab = "train" | "board" | "program" | "you" | "session";
type Overlay = null | "plan" | "pins" | "pr" | "coach" | "info";

export function VariantA({
  onState,
}: {
  onState: (state: Record<string, unknown>) => void;
}) {
  const [tab, setTab] = useState<Tab>("train");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [focus, setFocus] = useState<SampleLift | null>(null);
  const [pinned, setPinned] = useState<LiftId[]>(["bb-hip-thrust"]);
  const [hidden, setHidden] = useState<LiftId[]>([]);
  const [logged, setLogged] = useState(false);

  const board = useMemo(() => {
    const extras = EXTRAS.filter((lift) => pinned.includes(lift.id));
    return [...COMPOUNDS.filter((lift) => !hidden.includes(lift.id)), ...extras];
  }, [pinned, hidden]);

  useEffect(() => {
    onState({
      variant: "A Board",
      tab,
      overlay,
      pinned,
      hiddenCompounds: hidden,
      loggedSet: logged,
      focus: focus?.id ?? null,
    });
  }, [tab, overlay, pinned, hidden, logged, focus, onState]);

  function togglePin(id: LiftId, isCompound: boolean) {
    if (isCompound) {
      setHidden((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
      return;
    }
    setPinned((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  return (
    <div className="a">
      <div className="status-bar"><span>6:14</span><span>Lift</span></div>
      <div className="a-body">
        {tab === "train" && (
          <div className="a-hero">
            <div className="a-week">
              <span>{NEXT_WORKOUT.program}</span>
              <span>Week {NEXT_WORKOUT.week}/{NEXT_WORKOUT.weeks}</span>
            </div>
            <button type="button" className="start" onClick={() => setTab("session")}>
              <IconPlay size={22} />
              <span>
                <b>Start {NEXT_WORKOUT.day}</b>
                <span>{NEXT_WORKOUT.exercises.length} lifts · {NEXT_WORKOUT.sets} sets</span>
              </span>
            </button>
            <button type="button" className="a-week" onClick={() => setOverlay("plan")} style={{ width: "100%", background: "transparent", border: 0, cursor: "pointer", color: "inherit" }}>
              <span>Today’s work</span>
              <span>Plan →</span>
            </button>
            <div className="a-section-label">
              <span>This week</span>
              <button type="button" onClick={() => setOverlay("info")} style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer" }} aria-label="What counts as a PR">
                <IconInfo size={16} />
              </button>
            </div>
            <div className="a-pr-row">
              {WEEK_RECORDS.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className="a-pr-chip"
                  onClick={() => {
                    setFocus(ALL_LIFTS.find((lift) => lift.id === record.id) ?? null);
                    setOverlay("pr");
                  }}
                >
                  <IconSpark size={14} />
                  {record.name} {record.kind}
                </button>
              ))}
            </div>
            <div className="a-section-label">
              <span>Pinned</span>
              <button type="button" onClick={() => setOverlay("pins")} style={{ background: "transparent", border: 0, color: "#e8c547", cursor: "pointer", font: "inherit" }}>
                Edit
              </button>
            </div>
            <div className="a-board">
              {board
                .filter((lift) => pinned.includes(lift.id) || !!lift.recentPr)
                .slice(0, 4)
                .map((lift) => (
                <Tile key={lift.id} lift={lift} pinned={pinned.includes(lift.id) || (!!lift.compound && !hidden.includes(lift.id))} onPin={() => togglePin(lift.id, !!lift.compound)} onOpen={() => { setFocus(lift); setOverlay("pr"); }} />
              ))}
            </div>
          </div>
        )}

        {tab === "board" && (
          <>
            <div className="a-session-head">
              <h1 style={{ fontSize: "1.6rem", letterSpacing: "-0.04em" }}>Board</h1>
              <div style={{ display: "flex" }}>
                <button type="button" className="icon-btn" aria-label="Month review" onClick={() => setOverlay("info")}><IconCalendar /></button>
                <button type="button" className="icon-btn" aria-label="Edit pins" onClick={() => setOverlay("pins")}><IconPin filled /></button>
              </div>
            </div>
            <p style={{ color: "#a1a1aa", fontSize: "0.8rem", marginBottom: "0.4rem" }}>Compounds first. Pin anything else you want staring back at you.</p>
            <div className="a-board">
              {board.map((lift) => (
                <Tile
                  key={lift.id}
                  lift={lift}
                  pinned={pinned.includes(lift.id) || (!!lift.compound && !hidden.includes(lift.id))}
                  onPin={() => togglePin(lift.id, !!lift.compound)}
                  onOpen={() => { setFocus(lift); setOverlay("pr"); }}
                />
              ))}
            </div>
          </>
        )}

        {tab === "program" && (
          <>
            <h1 style={{ fontSize: "1.6rem", letterSpacing: "-0.04em" }}>Program</h1>
            <p style={{ color: "#a1a1aa", fontSize: "0.85rem", margin: "0.3rem 0 1rem" }}>{NEXT_WORKOUT.program} · Adaptive</p>
            <div className="a-you">
              {["Push", "Pull", "Legs", "Upper"].map((day, i) => (
                <div key={day} className="row" style={{ cursor: "default" }}>
                  <b>{day}</b>
                  <span style={{ color: "#a1a1aa" }}>{i === 0 ? "next" : `${3 + i} lifts`}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "you" && (
          <div className="a-you">
            <h1 style={{ fontSize: "1.6rem", letterSpacing: "-0.04em", marginBottom: "0.4rem" }}>You</h1>
            <button type="button" className="row" onClick={() => setOverlay("info")}>
              <span style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}><IconScale /> Weight</span>
              <b>182.4</b>
            </button>
            <button type="button" className="row" onClick={() => setOverlay("coach")}>
              <span>Coach</span>
              <span style={{ color: "#e8c547" }}>3 next steps</span>
            </button>
            <button type="button" className="row" onClick={() => setOverlay("info")}>
              <span>Rest default</span>
              <span>2:00</span>
            </button>
            <button type="button" className="row">Sign out</button>
          </div>
        )}

        {tab === "session" && (
          <Session
            logged={logged}
            onLog={() => setLogged(true)}
            onBack={() => { setLogged(false); setTab("train"); }}
            onPin={() => togglePin("bb-bench", true)}
            pinned={!hidden.includes("bb-bench")}
          />
        )}
      </div>

      {tab !== "session" && (
        <nav className="a-tabs">
          <button type="button" className={tab === "train" ? "on" : ""} onClick={() => setTab("train")}><IconPlay size={18} />Train</button>
          <button type="button" className={tab === "board" ? "on" : ""} onClick={() => setTab("board")}><IconGrid size={18} />Board</button>
          <button type="button" className={tab === "program" ? "on" : ""} onClick={() => setTab("program")}><IconProgram size={18} />Program</button>
          <button type="button" className={tab === "you" ? "on" : ""} onClick={() => setTab("you")}><IconUser size={18} />You</button>
        </nav>
      )}

      {overlay && overlay !== "pr" && (
        <>
          <button type="button" className="phone-scrim" aria-label="Close" onClick={() => setOverlay(null)} />
          <div className="phone-sheet">
            <div className="handle" />
            {overlay === "plan" && (
              <>
                <h2 style={{ fontSize: "1.15rem", marginBottom: "0.6rem" }}>Push · plan</h2>
                <ul className="a-list">
                  {NEXT_WORKOUT.exercises.map((item) => (
                    <li key={item.name}><span>{item.name}</span><span style={{ color: "#a1a1aa" }}>{item.rx}</span></li>
                  ))}
                </ul>
              </>
            )}
            {overlay === "pins" && <PinEditor pinned={pinned} hidden={hidden} onToggle={togglePin} />}
            {overlay === "coach" && (
              <>
                <h2 style={{ fontSize: "1.15rem", marginBottom: "0.4rem" }}>Coach</h2>
                <p style={{ color: "#a1a1aa", fontSize: "0.85rem", marginBottom: "0.8rem" }}>Three things worth a look. Full weekly paste stays behind Copy.</p>
                <ul className="a-list">
                  <li><span>Row has stalled 21d</span><span style={{ color: "#e8c547" }}>Review</span></li>
                  <li><span>OHP is moving</span><span>Keep</span></li>
                  <li><span>Volume −8% vs last week</span><span>Note</span></li>
                </ul>
              </>
            )}
            {overlay === "info" && (
              <>
                <h2 style={{ fontSize: "1.15rem", marginBottom: "0.4rem" }}>Records</h2>
                <p style={{ color: "#a1a1aa", fontSize: "0.9rem" }}>
                  A PR is more reps at the same load, or a higher estimated 1RM. First marks don’t count. The gold chips are this week’s only — the Board is the long view.
                </p>
              </>
            )}
          </div>
        </>
      )}

      {overlay === "pr" && focus && (
        <PrMoment lift={focus} onClose={() => { setOverlay(null); setFocus(null); }} />
      )}
    </div>
  );
}

function Tile({
  lift,
  pinned,
  onPin,
  onOpen,
}: {
  lift: SampleLift;
  pinned: boolean;
  onPin: () => void;
  onOpen: () => void;
}) {
  return (
    <article className={`a-tile${lift.recentPr ? " hot" : ""}`}>
      <button type="button" className="open" onClick={onOpen}>
        <div className="mark">{lift.short}</div>
        <div className="num">{lift.e1rm}</div>
        <div className={`delta${lift.delta > 0 ? " up" : ""}`}>
          {lift.delta === 0 ? "held" : `${signed(lift.delta)} ${lift.unit}`}
          {lift.recentPr ? " · PR" : ""}
        </div>
        <Sparkline values={lift.spark} color={lift.recentPr ? "#e8c547" : "#71717a"} />
      </button>
      <button type="button" className={`icon-btn pin${pinned ? " on" : ""}`} aria-label={pinned ? `Unpin ${lift.short}` : `Pin ${lift.short}`} onClick={onPin}>
        <IconPin size={16} filled={pinned} />
      </button>
    </article>
  );
}

function PinEditor({
  pinned,
  hidden,
  onToggle,
}: {
  pinned: LiftId[];
  hidden: LiftId[];
  onToggle: (id: LiftId, isCompound: boolean) => void;
}) {
  return (
    <>
      <h2 style={{ fontSize: "1.15rem" }}>Front and center</h2>
      <p style={{ color: "#a1a1aa", fontSize: "0.8rem", margin: "0.3rem 0 0.6rem" }}>Compounds start on the Board. Unpin one if it isn’t yours. Pin extras you actually chase.</p>
      <ul className="a-list">
        {[...COMPOUNDS, ...EXTRAS].map((lift) => {
          const on = lift.compound ? !hidden.includes(lift.id) : pinned.includes(lift.id);
          return (
            <li key={lift.id}>
              <span>{lift.name}</span>
              <button type="button" className="icon-btn" onClick={() => onToggle(lift.id, !!lift.compound)} aria-label={`${on ? "Unpin" : "Pin"} ${lift.short}`}>
                <IconPin size={18} filled={on} />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Session({
  logged,
  onLog,
  onBack,
  onPin,
  pinned,
}: {
  logged: boolean;
  onLog: () => void;
  onBack: () => void;
  onPin: () => void;
  pinned: boolean;
}) {
  return (
    <div>
      <div className="a-session-head">
        <button type="button" onClick={onBack} style={{ background: "transparent", border: 0, color: "#a1a1aa", cursor: "pointer" }}>Close</button>
        <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>Push · 1 of 6</span>
        <span />
      </div>
      <div className="a-session-lift">
        <div className="mark" style={{ color: "#a1a1aa", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em" }}>HORIZONTAL PRESS</div>
        <h2>Bench</h2>
      </div>
      <div className="a-actions">
        <button type="button" className="icon-btn" aria-label="Swap exercise"><IconSwap /></button>
        <button type="button" className="icon-btn" aria-label="Recent sets"><IconHistory /></button>
        <button type="button" className="icon-btn" aria-label={pinned ? "Unpin" : "Pin"} onClick={onPin}><IconPin filled={pinned} /></button>
        <button type="button" className="icon-btn" aria-label="About this target"><IconInfo /></button>
      </div>
      <div className="a-dots" aria-label="2 of 3 sets">
        <i className="on" /><i className="on" /><i />
      </div>
      <div className="a-target">
        <span style={{ color: "#a1a1aa", fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Target</span>
        <b>185 × 6</b>
      </div>
      <button type="button" className="a-log" onClick={onLog}>{logged ? "Logged" : "Log set"}</button>
      {logged && (
        <div className="a-stamp">
          <IconSpark size={16} /> e1RM PR · 275 lb
        </div>
      )}
    </div>
  );
}

function PrMoment({ lift, onClose }: { lift: SampleLift; onClose: () => void }) {
  return (
    <div className="phone-modal" style={{ background: "#0c0c0d", color: "#f4f4f5", padding: "1.4rem 1.2rem" }}>
      <div className="status-bar"><span>6:14</span><button type="button" onClick={onClose} style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer" }}>Close</button></div>
      <p style={{ color: "#e8c547", letterSpacing: "0.14em", textTransform: "uppercase", fontSize: "0.72rem", fontWeight: 800, marginTop: "2rem" }}>
        {lift.recentPr ? "Recent PR" : "Current best"}
      </p>
      <h2 style={{ fontSize: "2.4rem", letterSpacing: "-0.05em", lineHeight: 1, margin: "0.4rem 0" }}>{lift.short}</h2>
      <p style={{ fontSize: "3.2rem", fontWeight: 650, letterSpacing: "-0.06em", lineHeight: 1 }}>{lift.e1rm}<span style={{ fontSize: "1rem", color: "#a1a1aa" }}> {lift.unit}</span></p>
      <p style={{ color: lift.delta > 0 ? "#34d399" : "#a1a1aa", marginTop: "0.6rem" }}>{lift.delta === 0 ? "Held since last PR" : `${signed(lift.delta)} vs previous best · ${lift.lastPr} ago`}</p>
      <div style={{ marginTop: "1.4rem" }}><Sparkline values={lift.spark} color="#e8c547" /></div>
    </div>
  );
}

