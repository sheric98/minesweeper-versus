import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Minesweeper — classic 30×16 board with 99 mines";

const RAISED = {
  borderTop: "6px solid #ffffff",
  borderLeft: "6px solid #ffffff",
  borderBottom: "6px solid #808080",
  borderRight: "6px solid #808080",
} as const;

const SUNKEN = {
  borderTop: "6px solid #808080",
  borderLeft: "6px solid #808080",
  borderBottom: "6px solid #ffffff",
  borderRight: "6px solid #ffffff",
} as const;

const CELL = 96;

function revealedCell(content: string, color: string) {
  return (
    <div
      style={{
        width: CELL,
        height: CELL,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#c0c0c0",
        border: "3px solid #808080",
        fontSize: 56,
        fontWeight: 700,
        color,
      }}
    >
      {content}
    </div>
  );
}

function raisedCell(content = "") {
  return (
    <div
      style={{
        width: CELL,
        height: CELL,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#c0c0c0",
        fontSize: 48,
        ...RAISED,
      }}
    >
      {content}
    </div>
  );
}

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#008080",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "#c0c0c0",
            padding: 12,
            ...RAISED,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#000080",
              color: "#ffffff",
              fontSize: 44,
              fontWeight: 700,
              padding: "12px 24px",
              marginBottom: 12,
            }}
          >
            <span>Minesweeper</span>
            <span style={{ fontSize: 36 }}>— ▢ X</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#c0c0c0",
              padding: "16px 24px",
              marginBottom: 12,
              ...SUNKEN,
            }}
          >
            <div
              style={{
                display: "flex",
                background: "#000000",
                color: "#ff0000",
                fontSize: 52,
                fontWeight: 700,
                padding: "4px 12px",
              }}
            >
              099
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 88,
                height: 88,
                background: "#c0c0c0",
                fontSize: 52,
                ...RAISED,
              }}
            >
              😎
            </div>
            <div
              style={{
                display: "flex",
                background: "#000000",
                color: "#ff0000",
                fontSize: 52,
                fontWeight: 700,
                padding: "4px 12px",
              }}
            >
              000
            </div>
          </div>

          <div style={{ display: "flex", ...SUNKEN }}>
            {revealedCell("1", "#0000ff")}
            {revealedCell("2", "#008000")}
            {raisedCell("🚩")}
            {revealedCell("3", "#ff0000")}
            {raisedCell()}
            {raisedCell()}
            {revealedCell("💣", "#000000")}
            {raisedCell()}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              fontSize: 34,
              color: "#000000",
              paddingTop: 20,
              paddingBottom: 8,
            }}
          >
            30×16 · 99 mines · solo & multiplayer
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
