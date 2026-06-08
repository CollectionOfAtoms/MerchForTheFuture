export default function ComingSoonPage() {
  return (
    <div className="flex flex-col min-h-screen">

      {/* Hero */}
      <section className="bg-coral-glow border-b border-tuscan-sun/30 flex-1 flex items-center justify-center">
        <div className="px-6 flex flex-col items-center gap-6 text-center">
          <p className="text-2xl font-medium uppercase tracking-widest text-blue-slate">
            Merch For The Future
          </p>
          <h1 className="text-7xl sm:text-8xl font-semibold tracking-tight text-cerulean leading-tight">
            We are living up to our name!
          </h1>
          <p className="max-w-3xl text-4xl text-dark-cyan leading-relaxed">
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
