import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Split bills with Owez.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          height: "100%",
          background: "#0B0D0C",
          color: "#F4F5F3",
          fontFamily: "system-ui, sans-serif",
          padding: "60px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "48px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "#2EF2A3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              fontWeight: 800,
              color: "#053a24",
            }}
          >
            O
          </div>
          <div style={{ fontSize: "48px", fontWeight: 800, letterSpacing: "-0.02em" }}>
            Owez
          </div>
        </div>

        <div
          style={{
            fontSize: "56px",
            fontWeight: 800,
            textAlign: "center",
            lineHeight: 1.1,
            marginBottom: "48px",
            letterSpacing: "-0.02em",
          }}
        >
          Split bills with Owez.
        </div>

        <div
          style={{
            display: "flex",
            gap: "32px",
            alignItems: "flex-start",
          }}
        >
          {[
            { n: "1", text: "Take a picture." },
            { n: "2", text: "Send the link." },
            { n: "3", text: "Get paid back." },
          ].map((step) => (
            <div
              key={step.n}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "999px",
                  background: "#2EF2A3",
                  color: "#053a24",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "20px",
                  flexShrink: 0,
                }}
              >
                {step.n}
              </div>
              <div style={{ fontSize: "26px", fontWeight: 600 }}>
                {step.text}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: "40px",
            fontSize: "22px",
            color: "#9AA09C",
          }}
        >
          No sign up needed.
        </div>
      </div>
    ),
    { ...size },
  );
}
