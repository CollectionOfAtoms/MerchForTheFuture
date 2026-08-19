function HomeScreen({ setScreen }) {
  return (
    <div>
      <section style={{ background: "var(--color-coral-glow)", borderBottom: "1px solid rgba(249,199,79,0.3)", minHeight: "560px", display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: "url(../../assets/backgrounds/sunburst-tangerine.png)", backgroundSize: "cover", backgroundPosition: "center" }}>
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: "var(--weight-medium)", letterSpacing: "var(--tracking-widest)", textTransform: "uppercase", color: "var(--color-blue-slate)" }}>Merch For The Future</p>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "3.5rem", color: "var(--color-cerulean)", lineHeight: "var(--leading-tight)" }}>We are living up to our name.</h1>
          <p style={{ margin: 0, maxWidth: "640px", fontSize: "1.4rem", color: "var(--color-dark-cyan)", lineHeight: "var(--leading-relaxed)" }}>Sustainable clothing and original designs. Feel better about the future — and look good doing it.</p>
          <span onClick={() => setScreen("shop")} style={{ marginTop: "8px", borderRadius: "999px", background: "var(--color-cerulean)", color: "#fff", padding: "14px 32px", fontSize: "var(--text-base)", fontWeight: "var(--weight-medium)", cursor: "pointer" }}>Shop the collection</span>
        </div>
      </section>
      <section style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: "var(--content-narrow)", margin: "0 auto", padding: "64px 24px", textAlign: "center" }}>
          <p style={{ margin: "0 0 24px", fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)", textTransform: "uppercase", letterSpacing: "var(--tracking-widest)", color: "var(--color-seagrass)" }}>Our mission</p>
          <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: "300", color: "var(--text)", lineHeight: "var(--leading-relaxed)" }}>To create apparel that communicates our values toward our planet and its inhabitants with humor, exclusively human-made art, helpful information, and design choices that minimize harm — with the express intent of building hopeful visions of our future.</p>
        </div>
      </section>
      <section style={{ maxWidth: "var(--content-max)", margin: "0 auto", padding: "64px 24px" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "var(--color-cerulean)", marginBottom: "24px" }}>The material standard</h2>
        <p style={{ maxWidth: "640px", fontSize: "var(--text-base)", lineHeight: "var(--leading-relaxed)", color: "var(--muted)" }}>Every piece is sustainably sourced <em>and</em> biodegradable — natural fibers only, no synthetics, no synthetic blends. Today that means GOTS-certified organic cotton; tomorrow it may mean hemp or linen too.</p>
      </section>
    </div>
  );
}
window.HomeScreen = HomeScreen;
