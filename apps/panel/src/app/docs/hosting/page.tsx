import { Database, Globe, Rocket, KeyRound, Network, HardDriveDownload } from "lucide-react";

export default function HostingDocs() {
  return (
    <div className="space-y-7 text-white/70">
      <div>
        <h1 className="font-display text-4xl font-bold text-white">Hébergement complet</h1>
        <p className="mt-3 text-lg text-white/55">
          MGG n&apos;héberge pas que des jeux. Depuis le catalogue, déploie en 1 clic une{" "}
          <strong className="text-white">base de données</strong>, un{" "}
          <strong className="text-white">site web</strong> ou une{" "}
          <strong className="text-white">app / SaaS</strong> — avec la même gestion que les serveurs de jeu :
          console &amp; logs, gestionnaire de fichiers, sauvegardes, et le gestionnaire de RAM.
        </p>
      </div>

      <div className="glass p-5">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-white">
          <Rocket className="h-5 w-5 text-cyan" /> Déployer un service
        </h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-white/60">
          <li>Tableau de bord → <strong className="text-white">Déployer un serveur</strong>.</li>
          <li>Section <strong className="text-white">Hébergement</strong> : choisis Bases de données, Web ou Apps &amp; SaaS.</li>
          <li>Configure (les mots de passe sont générés automatiquement) puis <strong className="text-white">Déployer</strong>.</li>
          <li>Onglet <strong className="text-white">Réseau</strong> = l&apos;adresse + le port. Onglet <strong className="text-white">Réglages</strong> = les identifiants.</li>
        </ol>
      </div>

      {/* Databases */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
          <Database className="h-6 w-6 text-cyan" /> Bases de données
        </h2>
        <p className="text-sm text-white/60">
          <strong className="text-white">MySQL</strong>, <strong className="text-white">MariaDB</strong>,{" "}
          <strong className="text-white">PostgreSQL</strong> et <strong className="text-white">Redis</strong>. Idéal pour
          les plugins Minecraft (LuckPerms, CoreProtect…), un site WordPress, ou une app.
        </p>
        <div className="glass p-5 text-sm">
          <div className="flex items-center gap-2 font-medium text-white"><KeyRound className="h-4 w-4 text-cyan" /> Se connecter</div>
          <ul className="mt-2 space-y-1.5 text-white/60">
            <li><span className="text-white/80">Hôte / port</span> : onglet <em>Réseau</em> du serveur de base (ex. <code className="text-cyan-light">192.168.1.137:3306</code>).</li>
            <li><span className="text-white/80">Identifiants</span> : onglet <em>Réglages</em> (mot de passe root + utilisateur dédié, générés automatiquement).</li>
            <li><span className="text-white/80">Exemple plugin MC</span> : renseigne host/port/base/user/password dans le <code>config.yml</code> du plugin.</li>
          </ul>
          <p className="mt-3 text-white/45">
            Redis est protégé par mot de passe (requirepass) et persistant (AOF). PostgreSQL est recommandé pour les
            apps modernes (n8n, etc.).
          </p>
        </div>
      </section>

      {/* Web */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
          <Globe className="h-6 w-6 text-cyan" /> Hébergement web
        </h2>
        <ul className="space-y-1.5 text-sm text-white/60">
          <li><strong className="text-white">Nginx</strong> — site statique (HTML/CSS/JS, SPA buildée). Dépose tes fichiers dans le gestionnaire de fichiers (<code>/usr/share/nginx/html</code>).</li>
          <li><strong className="text-white">WordPress</strong> — blog / vitrine / boutique. Déploie d&apos;abord une base MySQL, puis renseigne <code>WORDPRESS_DB_HOST</code> (host:port), la base et les identifiants.</li>
        </ul>
      </section>

      {/* Apps */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
          <Rocket className="h-6 w-6 text-cyan" /> Apps &amp; SaaS (1 clic)
        </h2>
        <ul className="space-y-1.5 text-sm text-white/60">
          <li><strong className="text-white">n8n</strong> — automatisation no-code (alternative à Zapier/Make).</li>
          <li><strong className="text-white">Uptime Kuma</strong> — supervision &amp; page de statut de tes serveurs/sites.</li>
          <li><strong className="text-white">Vaultwarden</strong> — gestionnaire de mots de passe (compatible Bitwarden).</li>
          <li><strong className="text-white">Nextcloud</strong> — cloud privé (fichiers, agenda, contacts).</li>
        </ul>
        <p className="text-sm text-white/45">Besoin d&apos;une autre app ? Demande-la — un nouveau service = un simple template (données), sans refonte.</p>
      </section>

      {/* Tips */}
      <div className="glass p-5">
        <h2 className="font-display text-lg font-semibold text-white">Bon à savoir</h2>
        <ul className="mt-3 space-y-2 text-sm text-white/60">
          <li className="flex items-start gap-2"><Network className="mt-0.5 h-4 w-4 shrink-0 text-cyan" /> <span><strong className="text-white">Ports</strong> : chaque service prend son port standard (3306, 80, 5432…) s&apos;il est libre. Pour héberger plusieurs sites sur le port 80, passe par un domaine / reverse-proxy.</span></li>
          <li className="flex items-start gap-2"><HardDriveDownload className="mt-0.5 h-4 w-4 shrink-0 text-cyan" /> <span><strong className="text-white">Sauvegardes &amp; RAM</strong> : comme les jeux, chaque service a ses sauvegardes 1-clic et l&apos;onglet <em>Ressources</em> pour ajuster la RAM/CPU et voir ce qu&apos;il reste sur l&apos;hôte.</span></li>
        </ul>
      </div>
    </div>
  );
}
