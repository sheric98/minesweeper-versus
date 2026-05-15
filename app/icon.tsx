import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#c0c0c0",
          borderTop: "3px solid #ffffff",
          borderLeft: "3px solid #ffffff",
          borderBottom: "3px solid #808080",
          borderRight: "3px solid #808080",
          fontSize: 22,
          lineHeight: 1,
        }}
      >
        😎
      </div>
    ),
    { ...size },
  );
}
