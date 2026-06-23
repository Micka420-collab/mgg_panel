/** Ambient backdrop — refined: a faint masked grid + soft, restrained color
 *  orbs and a gentle vignette. Tuned to stay elegant and keep content legible. */
export function AmbientBackground({ dense = false }: { dense?: boolean }) {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-base">
      {/* faint grid, faded toward the edges */}
      <div
        className="absolute inset-0 bg-grid-faint [background-size:72px_72px]"
        style={{
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)",
        }}
      />
      {/* soft color orbs */}
      <div className="orb left-[-12%] top-[-18%] h-[560px] w-[560px] bg-cyan/[0.10]" />
      <div className="orb right-[-14%] top-[-6%] h-[520px] w-[520px] bg-violet/[0.10]" />
      {/* a few extra accent glows spread through the page */}
      <div className="orb left-[40%] top-[30%] h-[440px] w-[440px] bg-cyan/[0.06]" />
      <div className="orb right-[4%] bottom-[6%] h-[480px] w-[480px] bg-violet/[0.07]" />
      <div className="orb left-[-6%] bottom-[18%] h-[400px] w-[400px] bg-cyan-deep/[0.06]" />
      {dense && <div className="orb bottom-[-22%] left-[18%] h-[600px] w-[600px] bg-cyan-deep/[0.07]" />}
      {/* vignette + base fade for depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(124,92,255,0.06),transparent_55%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base/30 to-base" />
    </div>
  );
}
