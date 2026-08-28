/* ---------------------------------------------------------
   RameshVerse — SHARED TOOLS REGISTRY
   Single source of truth for every tool's name, url, category,
   and description. Used by:
     - homepage grid (optional: can render from this instead of
       hardcoded HTML, if you want zero duplication)
     - related-modules.js (picks "related" tools per page)
   Keep this in sync whenever you add/remove a tool.
   --------------------------------------------------------- */

window.RameshverseTools = [
  { id: "star-system-creator",        name: "Star System Creator 🌌",                          url: "/star-system-creator/",                 category: "science" },
  { id: "solar-system-simulator",     name: "Solar System Simulator 🪐",                       url: "/solar-system-simulator/",              category: "science" },
  { id: "lagrange-points-simulator",  name: "Lagrange Points Simulator ⚖️",                    url: "/lagrange-points-simulator/",           category: "science" },
  { id: "space-collision-simulator",  name: "Space Collision Simulator 💥",                    url: "/space-collision-simulator/",           category: "science" },
  { id: "cosmic-calculator",          name: "Cosmic Calculator ⭐",                             url: "/cosmic-calculator/",                   category: "science" },
  { id: "exoplanet-detector",         name: "Exoplanet Detector Simulator 🌗",                 url: "/exoplanet-detector-simulator/",        category: "science" },
  { id: "country-explorer",          name: "Country Explorer 🌍",                              url: "/country-explorer/",                    category: "geography" },
  { id: "asteroid-impact-simulator",  name: "Asteroid Impact Simulator ☄️",                    url: "/asteroid-impact-simulator/",           category: "science" },
  { id: "black-hole-simulator",       name: "Black Hole Simulator 🌀",                         url: "/black-hole-simulator/",                category: "science" },
  { id: "your-weight-in-space",       name: "Your Weight in Space 🪐",                         url: "/your-weight-in-space/",                category: "science" },
  { id: "stellar-death-simulator",    name: "Stellar Death Simulator",                          url: "/stellar-death-simulator/",             category: "science" },
  { id: "time-converter",             name: "Time Converter ⏱️🔄",                              url: "/time-converter/",                      category: "calculator" },
  { id: "subatomic-calculator",       name: "Subatomic Calculator ⚛️",                         url: "/subatomic-calculator/",                category: "science" },
  { id: "black-hole-radius-calculator", name: "Black Hole Event Horizon Radius Calculator ⭕", url: "/black-hole-radius-calculator/",        category: "science" },
  { id: "density-volume-calculator",  name: "Density and Volume Calculator 🧱🧊",              url: "/density-and-volume-calculator/",       category: "science" },
  { id: "top-10-tasks-monitor",       name: "Top 10 Task Monitor 📋",                          url: "/top-10-tasks-monitor/",                category: "productivity" },
  { id: "session-logger",             name: "Session Logger 📝⏳",                              url: "/session-logger/",                      category: "productivity" },
  { id: "my-diary",                   name: "My Calm Daily Diary 📔🌸",                        url: "/my-diary/",                            category: "productivity" },
  { id: "surface-gravity-calculator", name: "Surface Gravity & Escape Velocity Calculator 🚀", url: "/surface-gravity-calculator/",          category: "science" },
  { id: "pomodoro-focus",             name: "Pomodoro Focus 🍅🎯",                             url: "/pomodoro-focus/",                      category: "productivity" },
  { id: "division-pro",               name: "Division Pro ➗",                                 url: "/division-pro/",                        category: "calculator" },
  { id: "mean-median-mode",           name: "Mean · Median · Mode 🧮",                         url: "/mean-median-mode/",                    category: "calculator" },
  { id: "seconds-to-frames",          name: "Seconds to Frames 🎞️",                            url: "/seconds-to-frames/",                   category: "calculator" },
  { id: "brain-dump",                 name: "🧠🧹 Brain Dump",                                 url: "/brain-dump/",                          category: "productivity" },
  { id: "daily-routine",              name: "Daily Routine ⏰",                                url: "/daily-routine/",                       category: "productivity" },
  { id: "travel-checklist",           name: "International Travel Checklist 🧳✈️",             url: "/international-airtravel-checklist/",   category: "productivity" },
  { id: "percentage-of-total",        name: "Percentage of Total 🧮",                          url: "/percentage-of-total/",                 category: "finance" },
  { id: "percentage-of-a-number",     name: "Percent of a Number ％",                          url: "/percentage-of-a-number/",              category: "finance" },
  { id: "percentage-change",          name: "Percentage Change Calculator 📈",                 url: "/percentage-change-calculator/",        category: "finance" },
  { id: "percentage-difference",      name: "Percentage Difference Calculator 📊",             url: "/percentage-difference-calculator/",    category: "finance" },
  { id: "scientific-converter",       name: "Scientific Notation ⇄ Decimal Converter ⚙️",      url: "/scientific-converter/",                category: "science" },
  { id: "weight-converter",           name: "⚖️ Universal Weight Converter",                   url: "/weight-converter/",                    category: "calculator" },
  { id: "stock-profit-calculator",    name: "Stock Profit / Loss Calculator 💰",               url: "/stock-profit-calculator/",             category: "finance" },
  { id: "average-share-price",        name: "Average Share Price Calculator 📊",               url: "/average-share-price-calculator/",      category: "finance" },
  { id: "emi-calculator",             name: "🏦 EMI Calculator",                               url: "/emi-calculator/",                      category: "finance" },
  { id: "currency-converter",         name: "Currency Converter 💵⇄💶",                        url: "/currency-converter/",                  category: "finance" },
  { id: "simple-calculator",          name: "Simple Calculator 🧮",                            url: "/simple-calculator/",                   category: "finance" },
  { id: "know-your-sphere",           name: "Know Your Sphere 🌐",                             url: "/know-your-sphere/",                    category: "calculator" },
  { id: "periodic-table",             name: "Periodic Table ⚛️",                               url: "/periodic-table/",                      category: "science" },
  { id: "asteroid-hunter",            name: "Asteroid Hunter 🎮☄️",                            url: "/games/asteroid-hunter/",               category: "games" },
  { id: "lunar-lander",               name: "Lunar Lander 🎮🌕",                                url: "/games/lunar-lander/",                  category: "games" },
  { id: "target-lock",                name: "Target Lock 🎮🎯",                                url: "/games/target-lock/",                   category: "games" },
  { id: "sky-tonight",                name: "Sky Tonight",                                      url: "/sky-tonight/",                   category: "science" },
  { id: "planets-positions-now",      name: "Planets Positions Now",                            url: "/sky-tonight/",                   category: "science" },
  { id: "sky-at-birth",      name: "Sky at Birth",                                              url: "/sky-at-birth/",                   category: "science" },
  { id: "light-speed-messenger",      name: "Light Speed Messenger",                            url: "/light-speed-messenger/",                   category: "science" }
];
