export default function ComingSoonPage() {
  return (
    <div className="flex flex-col">

      {/* Hero — the sunburst background illustration sits behind the text, with
          bg-coral-glow as the base tint if the image is slow/absent. */}
      <section
        className="bg-coral-glow border-b border-tuscan-sun/30 min-h-screen flex items-center justify-center bg-cover bg-center"
        style={{ backgroundImage: "url(/coming-soon-bg.png)" }}
      >
        {/* The hero sits on the fixed sunburst illustration in both themes, so its
            text keeps the dark brand colours rather than following the dark-mode
            remap (which would flip them to cream and fight the bright backdrop).
            Inline token colours aren't matched by the utility remap in globals.css. */}
        <div className="px-6 flex flex-col items-center gap-6 text-center">
          <p className="text-2xl font-medium uppercase tracking-widest" style={{ color: "var(--color-blue-slate)" }}>
            Merch For The Future
          </p>
          <h1 className="font-display text-5xl sm:text-6xl tracking-tight leading-tight" style={{ color: "var(--color-cerulean)" }}>
            We are living up to our name!
          </h1>
          <p className="max-w-3xl text-4xl leading-relaxed" style={{ color: "var(--color-blue-slate)" }}>
            Sustainable clothing and original designs coming soon.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="bg-tuscan-sun/10 border-b border-tuscan-sun/30">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-seagrass mb-6">Our mission</p>
          <p className="text-xl sm:text-2xl text-blue-slate leading-relaxed font-light">
            To create apparel that communicate our values toward our planet and its inhabitants with humor,
            exclusively human-made art, helpful information, and design choices that minimize harm for the
            planet in the creation of our products, with the express intent of building hopeful visions of
            our future.
          </p>
        </div>
      </section>

    </div>
  );
}
