"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { T, Lang } from "./lib/translations";

export default function Landing() {
  const [lang, setLang] = useState<Lang>("en");
  const router = useRouter();
  const t = T[lang];

  const handleLaunch = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("pace-seed-lang", lang);
    }
    router.push("/platform");
  };

  const steps = [
    { n: "01", title: t.step1title, desc: t.step1desc, color: "#3b82f6" },
    { n: "02", title: t.step2title, desc: t.step2desc, color: "#22c55e" },
    { n: "03", title: t.step3title, desc: t.step3desc, color: "#a855f7" },
  ];

  const layers = [
    { icon: "🌧️", label: "Stormwater & Runoff", color: "3b82f6" },
    { icon: "🌡️", label: "Heat Island Effect", color: "ef4444" },
    { icon: "🌿", label: "Ecological Connectivity", color: "22c55e" },
    { icon: "🚶", label: "Accessibility & Mobility", color: "f59e0b" },
    { icon: "👥", label: "Social Vulnerability", color: "a855f7" },
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0f1e",
        color: "white",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <style>{`
        .fcard:hover { transform: translateY(-4px); border-color: #3b82f6 !important; }
        .fcard { transition: all 0.2s ease; }
        .lbtn:hover { background: #2563eb !important; }
        .lbtn { transition: background 0.15s ease; }
      `}</style>

      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(#1e293b18 1px, transparent 1px), linear-gradient(90deg, #1e293b18 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <header
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 40px",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 26 }}>🏙️</span>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3 }}>
            PACE-SEED
          </span>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {(["en", "sv"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              style={{
                background: lang === l ? "#1e293b" : "transparent",
                color: lang === l ? "white" : "#64748b",
                border: `1px solid ${lang === l ? "#3b82f6" : "#334155"}`,
                borderRadius: 8,
                padding: "6px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: lang === l ? "bold" : "normal",
              }}
            >
              {l === "en" ? "🇬🇧 EN" : "🇸🇪 SV"}
            </button>
          ))}
        </div>
      </header>

      <section
        style={{
          position: "relative",
          zIndex: 10,
          textAlign: "center",
          padding: "80px 40px 60px",
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: "#1e3a5f",
            border: "1px solid #334155",
            borderRadius: 10,
            padding: "6px 18px",
            fontSize: 11,
            color: "#7dd3fc",
            marginBottom: 24,
            letterSpacing: 2,
          }}
        >
          URBAN DIGITAL TWIN · PLATFORM
        </div>

        <h1
          style={{
            fontSize: 64,
            fontWeight: 900,
            margin: "0 0 16px",
            background:
              "linear-gradient(135deg, #ffffff 0%, #7dd3fc 50%, #a78bfa 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          PACE-SEED
        </h1>

        <p
          style={{
            fontSize: 20,
            color: "#94a3b8",
            maxWidth: 600,
            margin: "0 auto 14px",
            lineHeight: 1.6,
          }}
        >
          {t.tagline}
        </p>

        <p
          style={{
            fontSize: 15,
            color: "#475569",
            maxWidth: 500,
            margin: "0 auto 40px",
            lineHeight: 1.7,
          }}
        >
          {t.subtitle}
        </p>

        <button
          className="lbtn"
          onClick={handleLaunch}
          style={{
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 12,
            padding: "16px 40px",
            fontSize: 18,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {t.launch}
        </button>
      </section>

      <section
        style={{
          position: "relative",
          zIndex: 10,
          padding: "0 40px 60px",
          maxWidth: 960,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 16,
          }}
        >
          {t.features.map((f, i) => (
            <div
              key={i}
              className="fcard"
              style={{
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 14,
                padding: 24,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#e2e8f0",
                }}
              >
                {f.title}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          position: "relative",
          zIndex: 10,
          padding: "0 40px 60px",
          maxWidth: 860,
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            textAlign: "center",
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 36,
            color: "#e2e8f0",
          }}
        >
          {t.howItWorks}
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
          }}
        >
          {steps.map((step) => (
            <div
              key={step.n}
              style={{
                position: "relative",
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 14,
                padding: 24,
              }}
            >
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 900,
                  color: step.color,
                  opacity: 0.12,
                  position: "absolute",
                  top: 12,
                  right: 16,
                }}
              >
                {step.n}
              </div>

              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: step.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 12,
                  color: "white",
                }}
              >
                {step.n}
              </div>

              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#e2e8f0",
                }}
              >
                {step.title}
              </h3>

              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          position: "relative",
          zIndex: 10,
          padding: "0 40px 60px",
          maxWidth: 860,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 16,
            padding: 28,
          }}
        >
          <h3
            style={{
              textAlign: "center",
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 18,
              color: "#64748b",
              letterSpacing: 2,
            }}
          >
            5 SUSTAINABILITY DATA LAYERS
          </h3>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              justifyContent: "center",
            }}
          >
            {layers.map((cat) => (
              <div
                key={cat.label}
                style={{
                  background: "#1e293b",
                  border: `1px solid #${cat.color}44`,
                  borderRadius: 20,
                  padding: "7px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>{cat.icon}</span>
                <span style={{ fontSize: 13, color: "#e2e8f0" }}>{cat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        style={{
          position: "relative",
          zIndex: 10,
          textAlign: "center",
          padding: "0 40px 80px",
        }}
      >
        <button
          className="lbtn"
          onClick={handleLaunch}
          style={{
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 12,
            padding: "16px 40px",
            fontSize: 18,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {t.launch}
        </button>

        <p style={{ marginTop: 10, fontSize: 12, color: "#334155" }}>
          Free to use · No login required · Runs in your browser
        </p>
      </section>

      <footer
        style={{
          position: "relative",
          zIndex: 10,
          borderTop: "1px solid #1e293b",
          padding: "18px 40px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 13, color: "#334155" }}>
          🏙️ PACE-SEED — Platform for Advanced City Environments
        </span>
        <span style={{ fontSize: 12, color: "#1e293b" }}>
          Three.js · Next.js · Supabase
        </span>
      </footer>
    </main>
  );
}