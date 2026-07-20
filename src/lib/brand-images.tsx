import { ImageResponse } from "next/og";

import { PARTYROLL_MARK_PATH } from "@/lib/partyroll-mark";
import { BRAND_COLORS } from "@/lib/site-metadata";

export function createPartyrollIcon(size: number) {
  const inset = Math.max(3, Math.round(size * 0.18));

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: BRAND_COLORS.paper,
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <svg
          height={size - inset * 2}
          viewBox="0 0 48 48"
          width={size - inset * 2}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d={PARTYROLL_MARK_PATH}
            fill={BRAND_COLORS.evergreen}
            fillRule="evenodd"
          />
        </svg>
      </div>
    ),
    { height: size, width: size },
  );
}

export function createShareImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: BRAND_COLORS.paper,
          color: BRAND_COLORS.evergreen,
          display: "flex",
          fontFamily: "sans-serif",
          height: "100%",
          overflow: "hidden",
          padding: "72px 82px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background: BRAND_COLORS.apricot,
            borderRadius: 999,
            display: "flex",
            height: 220,
            opacity: 0.2,
            position: "absolute",
            right: -55,
            top: -65,
            width: 220,
          }}
        />
        <div
          style={{
            border: `4px solid ${BRAND_COLORS.marigold}`,
            display: "flex",
            height: 200,
            opacity: 0.55,
            position: "absolute",
            right: 82,
            top: 82,
            transform: "rotate(5deg)",
            width: 154,
          }}
        />
        <div
          style={{
            border: `4px solid ${BRAND_COLORS.evergreen}`,
            display: "flex",
            height: 200,
            opacity: 0.16,
            position: "absolute",
            right: 218,
            top: 116,
            transform: "rotate(-4deg)",
            width: 154,
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ alignItems: "center", display: "flex" }}>
            <svg
              height="58"
              viewBox="0 0 48 48"
              width="58"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d={PARTYROLL_MARK_PATH}
                fill={BRAND_COLORS.evergreen}
                fillRule="evenodd"
              />
            </svg>
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: "-1.5px",
                marginLeft: 18,
              }}
            >
              Partyroll
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", width: 830 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 74,
                fontWeight: 700,
                letterSpacing: "-4px",
                lineHeight: 1.02,
              }}
            >
              <div style={{ display: "flex" }}>Pass the camera.</div>
              <div style={{ display: "flex" }}>Keep the whole party.</div>
            </div>
            <div
              style={{
                color: "#596861",
                fontSize: 27,
                lineHeight: 1.35,
                marginTop: 30,
              }}
            >
              One private roll, made by everyone there.
            </div>
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "3px",
              textTransform: "uppercase",
            }}
          >
            <div
              style={{
                background: BRAND_COLORS.marigold,
                display: "flex",
                height: 4,
                marginRight: 16,
                width: 42,
              }}
            />
            Private party galleries
          </div>
        </div>
      </div>
    ),
    { height: 630, width: 1200 },
  );
}
