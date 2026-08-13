window.Rameshverse = {
    API_BASE: "https://rameshverse-api.ramesh-rkvfx.workers.dev"
};


/* ---------------------------------------------------------
   RameshVerse — TERMINATOR HUD HOME NAVIGATION
   --------------------------------------------------------- */

(function () {

    // Guard against double-injection if this script somehow loads twice
    // on the same page.
    if (document.querySelector(".rv-hud-home")) return;

    // Don't show a "go home" button while already on the home page —
    // it served no purpose there and just sat in the corner.
    const HOME_PATHS = ["/", "/index.html", "/index.htm"];
    if (HOME_PATHS.includes(window.location.pathname)) return;

    function init() {

        const homeButton = document.createElement("a");

        homeButton.href = "/";
        homeButton.className = "rv-hud-home";
        homeButton.setAttribute(
            "aria-label",
            "Return to RameshVerse home"
        );

        homeButton.innerHTML = `
            <span class="rv-hud-fill" aria-hidden="true"></span>
            <span class="rv-hud-dot"></span>
            <span class="rv-hud-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                    <path d="M15 5L8 12L15 19" stroke="currentColor"
                          stroke-width="2.4" stroke-linecap="round"
                          stroke-linejoin="round"/>
                </svg>
            </span>
            <span class="rv-hud-text">
                <span class="rv-hud-main">RAMESHVERSE</span>
                <span class="rv-hud-sub">// RETURN HOME</span>
            </span>
        `;


        /* ---------------------------------------------------------
           HUD STYLES
           --------------------------------------------------------- */

        const style = document.createElement("style");

        style.id = "rameshverse-hud-style";

        style.textContent = `

            /* ---------- MAIN HUD BUTTON ----------
               clip-path clips the WHOLE box, including its border — a
               border only ever paints along the original rectangle's
               four sides, so the diagonal edges created by the clip
               were left with no stroke at all (the "open" look at the
               point). Fixed with a two-layer technique: this outer
               element IS the border color, and a smaller, separately
               clipped ".rv-hud-fill" layer sits inset a couple of
               pixels inside it to recreate the dark fill — so the
               border color shows everywhere around the shape,
               including along the arrow tip. */

            .rv-hud-home {

                position: fixed;

                top: max(14px, env(safe-area-inset-top));
                left: max(14px, env(safe-area-inset-left));

                z-index: 99999;

                display: flex;
                align-items: center;

                gap: 8px;

                min-height: 34px;

                padding: 8px 14px 8px 27px;

                color: #ff3b30;

                background: rgba(255, 59, 48, 0.75);

                font-family:
                    "Courier New",
                    Consolas,
                    monospace;

                font-size: 11px;

                font-weight: 700;

                letter-spacing: 1.2px;

                line-height: 1;

                text-decoration: none;
                -webkit-tap-highlight-color: transparent;

                box-shadow:
                    0 0 8px rgba(255, 59, 48, 0.18);

                /*
                 * LEFT-POINTING ARROW SHAPE
                 */
                clip-path: polygon(
                    0 50%,
                    20px 0,
                    100% 0,
                    100% 100%,
                    20px 100%
                );

                transition:
                    color 0.2s ease,
                    background 0.2s ease,
                    box-shadow 0.2s ease,
                    transform 0.15s ease,
                    padding-left 0.2s ease;
            }


            /* ---------- DARK FILL LAYER (creates the border) ---------- */

            .rv-hud-fill {

                position: absolute;

                inset: 1.5px;

                z-index: 0;

                background:
                    linear-gradient(
                        135deg,
                        rgba(25, 5, 5, 0.97),
                        rgba(8, 8, 8, 0.97)
                    );

                clip-path: polygon(
                    0 50%,
                    18.5px 0,
                    100% 0,
                    100% 100%,
                    18.5px 100%
                );

                pointer-events: none;
            }


            /* ---------- SCANLINES ---------- */

            .rv-hud-fill::after {

                content: "";

                position: absolute;

                inset: 0;

                background:
                    repeating-linear-gradient(
                        0deg,
                        transparent 0px,
                        transparent 2px,
                        rgba(255, 59, 48, 0.045) 3px
                    );

                pointer-events: none;
            }


            /* ---------- HUD STATUS LIGHT ---------- */

            .rv-hud-dot {

                position: relative;

                z-index: 1;

                width: 6px;
                height: 6px;

                flex-shrink: 0;

                background: #ff3b30;

                border-radius: 50%;

                box-shadow:
                    0 0 5px #ff3b30,
                    0 0 10px rgba(255, 59, 48, 0.7);

                animation:
                    rvHudPulse 1.8s ease-in-out infinite;
            }


            /* ---------- DIRECTIONAL ARROW ICON ---------- */

            .rv-hud-arrow {

                position: relative;

                z-index: 1;

                display: flex;
                align-items: center;

                width: 12px;
                height: 12px;

                flex-shrink: 0;

                transition: transform 0.2s ease;
            }

            .rv-hud-arrow svg {

                width: 100%;
                height: 100%;

                color: #ff3b30;
            }


            /* ---------- TEXT GROUP ---------- */

            .rv-hud-text {

                position: relative;

                z-index: 1;

                display: flex;
                flex-direction: column;

                line-height: 1.3;
            }


            /* ---------- MAIN TEXT ---------- */

            .rv-hud-main {

                white-space: nowrap;
            }


            /* ---------- SECONDARY TEXT ---------- */

            .rv-hud-sub {

                opacity: 0.55;

                font-size: 9px;

                letter-spacing: 1px;

                white-space: nowrap;
            }


            /* ---------- HOVER ---------- */

            .rv-hud-home:hover {

                color: #ff6258;

                padding-left: 23px;

                background: rgba(255, 59, 48, 1);

                box-shadow:

                    0 0 12px
                    rgba(255, 59, 48, 0.4),

                    0 0 25px
                    rgba(255, 59, 48, 0.15);
            }

            .rv-hud-home:hover .rv-hud-arrow {

                transform: translateX(-3px);
            }


            /* ---------- KEYBOARD FOCUS ---------- */

            .rv-hud-home:focus-visible {

                outline: 2px solid #ff6258;
                outline-offset: 3px;
            }


            /* ---------- CLICK ---------- */

            .rv-hud-home:active {

                transform: scale(0.96);
            }


            /* ---------- STATUS LIGHT ANIMATION ---------- */

            @keyframes rvHudPulse {

                0%,
                100% {

                    opacity: 0.65;

                    box-shadow:
                        0 0 4px #ff3b30,
                        0 0 8px rgba(255, 59, 48, 0.5);
                }

                50% {

                    opacity: 1;

                    box-shadow:
                        0 0 6px #ff3b30,
                        0 0 14px rgba(255, 59, 48, 0.85);
                }
            }


            /* ---------- REDUCED MOTION ---------- */

            @media (prefers-reduced-motion: reduce) {

                .rv-hud-dot {

                    animation: none;
                }

                .rv-hud-home,
                .rv-hud-home:hover,
                .rv-hud-arrow {

                    transition: none;
                }
            }


            /* ---------- MOBILE: TINY & THIN ----------
               Desktop keeps the full label — plenty of room there.
               On mobile, instead of moving the button or guessing at
               each tool's header layout, just make it drastically
               smaller: icon-only (dot + arrow, no text), a much
               shorter/thinner bar, and a smaller notch to match — so
               whatever footprint it has left is small enough to stay
               out of the way in the corner. Position (top-left) is
               untouched, same as desktop. */

            @media (max-width: 768px) {

                .rv-hud-home {

                    min-height: 24px;

                    padding: 5px 9px 5px 15px;

                    gap: 5px;

                    clip-path: polygon(
                        0 50%,
                        13px 0,
                        100% 0,
                        100% 100%,
                        13px 100%
                    );
                }

                .rv-hud-fill {

                    clip-path: polygon(
                        0 50%,
                        11.5px 0,
                        100% 0,
                        100% 100%,
                        11.5px 100%
                    );
                }

                .rv-hud-text {

                    display: none;
                }

                .rv-hud-dot {

                    width: 4px;
                    height: 4px;
                }

                .rv-hud-arrow {

                    width: 9px;
                    height: 9px;
                }
            }

        `;


        /* ---------------------------------------------------------
           ADD STYLES + BUTTON TO PAGE
           --------------------------------------------------------- */

        document.head.appendChild(style);

        document.body.appendChild(homeButton);
    }

    if (document.body) {
        init();
    } else {
        document.addEventListener("DOMContentLoaded", init);
    }

})();