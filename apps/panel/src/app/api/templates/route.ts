import { TEMPLATES } from "@mgg/shared";
import { json, route } from "@/lib/http";

/** Public catalog used by the create-server wizard and the marketing site. */
export const GET = route(async () => {
  const catalog = TEMPLATES.map((t) => ({
    id: t.id,
    game: t.game,
    name: t.name,
    tagline: t.tagline,
    description: t.description,
    icon: t.icon,
    color: t.color,
    category: t.category,
    features: t.features,
    images: Object.keys(t.dockerImages),
    defaultImage: Object.entries(t.dockerImages).find(([, v]) => v === t.defaultImage)?.[0] ?? null,
    resources: t.resources,
    docsUrl: t.docsUrl,
    variables: t.variables
      .filter((v) => v.userViewable && v.userEditable)
      .map((v) => ({
        key: v.key,
        name: v.name,
        description: v.description,
        type: v.type,
        default: v.default,
        options: v.options,
        group: v.group ?? "General",
      })),
  }));
  return json({ templates: catalog });
});
