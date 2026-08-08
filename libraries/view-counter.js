window.addEventListener("load", () => {

    const parts = window.location.pathname
    .split("/")
    .filter(Boolean);

    const slug =
    parts[parts.length - 1] === "index.html"
        ? parts[parts.length - 2]
        : parts[parts.length - 1];

    fetch(`${window.Rameshverse.API_BASE}/api/view/${slug}`)
        .catch(error =>
            console.error("View counter failed:", error)
        );

});