/* ---------------------------------------------------------
   RameshVerse — RELATED MODULES STRIP
   Picks 3 random tools from the current tool's category, and
   fills any gap with random tools from other categories.
   Reads from window.RameshverseTools (tools-data.js).
   Current tool is auto-detected from the page URL — no
   per-page config needed, as long as each tool's "url" in
   tools-data.js matches its real folder path.
   --------------------------------------------------------- */

(function () {

    if (!window.RameshverseTools) return;

    const allTools = window.RameshverseTools;

    // Normalize current path: strip trailing slash, ensure leading slash,
    // drop "index.html" if present, so "/emi-calculator/index.html",
    // "/emi-calculator/", and "/emi-calculator" all match the same way.
    function normalizePath(path) {
        let p = path.replace(/index\.html?$/i, "");
        if (!p.startsWith("/")) p = "/" + p;
        if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
        return p.toLowerCase();
    }

    const currentPath = normalizePath(window.location.pathname);
    const currentTool = allTools.find(
        t => normalizePath(t.url) === currentPath
    );

    if (!currentTool) return;

    const COUNT = 3;

    function shuffle(arr) {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function getRelated() {
        const sameCategory = allTools.filter(
            t => t.category === currentTool.category && t.id !== currentTool.id
        );

        let related = shuffle(sameCategory).slice(0, COUNT);

        if (related.length < COUNT) {
            const usedIds = new Set([currentTool.id, ...related.map(t => t.id)]);
            const others = allTools.filter(t => !usedIds.has(t.id));
            const fillCount = COUNT - related.length;
            related = related.concat(shuffle(others).slice(0, fillCount));
        }

        return related;
    }

    function render() {

        const related = getRelated();
        if (!related.length) return;

        const wrap = document.createElement("section");
        wrap.className = "rv-related";

        const cardsHtml = related.map(t => `
            <a class="rv-related-card" href="${t.url}">
                <span class="rv-related-corner tl" aria-hidden="true"></span>
                <span class="rv-related-corner tr" aria-hidden="true"></span>
                <span class="rv-related-corner bl" aria-hidden="true"></span>
                <span class="rv-related-corner br" aria-hidden="true"></span>
                <span class="rv-related-name">${t.name}</span>
            </a>
        `).join("");

        wrap.innerHTML = `
            <div class="rv-related-header">◄ RELATED MODULES ►</div>
            <div class="rv-related-grid">${cardsHtml}</div>
        `;

        const style = document.createElement("style");
        style.textContent = `
            .rv-related {
                display: block;
                position: absolute;
                left: 0;
                right: 0;
                top: 0;
                margin: 0 auto;
                width: 100%;
                box-sizing: border-box;
                max-width: 1000px;
                padding: 0 12px 12px;
                font-family: 'Space Mono', 'Courier New', monospace;
                clear: both;
            }

            .rv-related-header {
                text-align: center;
                font-size: 0.72rem;
                letter-spacing: 0.18em;
                text-transform: uppercase;
                color: #ff2b2b;
                text-shadow: 0 0 8px rgba(255,43,43,0.5);
                opacity: .85;
                margin-bottom: 16px;
            }

            .rv-related-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 16px;
            }

            .rv-related-card {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                text-align: center;
                min-height: 70px;
                padding: 14px 16px;
                border-radius: 12px;
                text-decoration: none;
                color: #fff;
                background: linear-gradient(180deg, #1b1b1d, #0c0c0d);
                border: 1px solid rgba(255,43,43,0.16);
                box-shadow: 0 8px 20px rgba(0,0,0,.35);
                transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
            }

            .rv-related-card:hover {
                transform: translateY(-3px) scale(1.02);
                border-color: #ff2b2b;
                box-shadow: 0 10px 24px rgba(0,0,0,.4), 0 0 16px rgba(255,43,43,.3);
            }

            .rv-related-name {
                font-size: 0.85rem;
                line-height: 1.35;
                text-shadow: 0 0 6px rgba(255,43,43,0.3);
            }

            .rv-related-corner {
                position: absolute;
                width: 12px;
                height: 12px;
                opacity: .5;
                pointer-events: none;
            }
            .rv-related-corner.tl { top: 8px; left: 8px;    border-top: 2px solid #ff2b2b; border-left: 2px solid #ff2b2b; }
            .rv-related-corner.tr { top: 8px; right: 8px;   border-top: 2px solid #ff2b2b; border-right: 2px solid #ff2b2b; }
            .rv-related-corner.bl { bottom: 8px; left: 8px; border-bottom: 2px solid #ff2b2b; border-left: 2px solid #ff2b2b; }
            .rv-related-corner.br { bottom: 8px; right: 8px; border-bottom: 2px solid #ff2b2b; border-right: 2px solid #ff2b2b; }

            @media (max-width: 600px) {
                .rv-related-grid { grid-template-columns: 1fr; }
            }
        `;

        document.head.appendChild(style);

        // Guessing at the page's layout system (flex/grid/fixed) is too
        // fragile across ~40 differently-built tool pages. Instead,
        // measure where the visible content actually ends on screen and
        // plant the block exactly below that point — works regardless
        // of what layout technique the page uses.
        function positionAtBottom() {
            let maxBottom = 0;
            Array.from(document.body.children).forEach(el => {
                if (el === wrap) return;
                if (getComputedStyle(el).display === "none") return;
                const rect = el.getBoundingClientRect();
                if (rect.height === 0) return;
                if (rect.bottom > maxBottom) maxBottom = rect.bottom;
            });

            const docTop = window.scrollY || window.pageYOffset || 0;
            const targetTop = maxBottom + docTop + 32;

            // position/left/right/margin are already set by the .rv-related
            // CSS class itself (applied before this element ever enters
            // the DOM), so it's never treated as a flex/grid item — not
            // even momentarily. Only the computed top offset changes here.
            wrap.style.top = targetTop + "px";

            // Browsers automatically extend page scroll to reach content
            // positioned absolutely beyond the current flow — no need to
            // stretch body's own height for that. (Forcing body's
            // min-height here previously re-centered flex-centered cards
            // lower on the page, since body{display:flex;align-items:
            // center} centers within whatever height it's given.)
            if (getComputedStyle(document.body).overflow === "hidden") {
                document.body.style.overflow = "visible";
            }
            if (getComputedStyle(document.documentElement).overflow === "hidden") {
                document.documentElement.style.overflowY = "auto";
            }
        }

        document.body.appendChild(wrap);
        positionAtBottom();

        // Canvas-based simulators sometimes resize/settle after initial
        // paint (e.g. a three.js scene sizing itself on load). Re-measure
        // shortly after and again on window load to correct for that.
        window.addEventListener("load", positionAtBottom);
        setTimeout(positionAtBottom, 800);
        window.addEventListener("resize", positionAtBottom);

        // Calculators often grow taller after the user hits "Calculate"
        // (a result box appears). Watch the page for that and reposition
        // — debounced so rapid changes don't trigger a reposition storm.
        let repositionTimer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(repositionTimer);
            repositionTimer = setTimeout(positionAtBottom, 120);
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["style", "class"]
        });
    }

    if (document.body) {
        render();
    } else {
        document.addEventListener("DOMContentLoaded", render);
    }

})();