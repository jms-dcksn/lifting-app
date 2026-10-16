import path from "node:path";

const runtime = /\/src\/(app|components|lib)\//;
const evalPath = /\/src\/lib\/agent\/evals\//;
const testPath = /\.(test|spec)\.[cm]?[jt]sx?$/;
const protectedConsumer = /\/src\/(app|components)\/|\/src\/lib\/agent\/tools\//;
const secrets = new Set(["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
const propertyName = node => node?.type === "Identifier" ? node.name : node?.value;

const architectureBoundary = {
  meta: { type: "problem", schema: [], messages: {
    pure: "Keep strength modules framework-free. Depend only on modules inside src/lib/strength.",
    eval: "Application code must use signed-in domain loaders, never live-eval helpers.",
    target: "Use resolveExactWorkoutTarget for effective targets; startingWeight and progression types remain supported here.",
    secret: "Privileged Supabase credentials are confined to local live agent evals.",
  } },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    if (!runtime.test(filename) || testPath.test(filename)) return {};
    const sourceRoot = filename.slice(0, filename.indexOf("/src/") + 5);
    const resolve = value => value.startsWith("@/") ? sourceRoot + value.slice(2)
      : value.startsWith(".") ? path.resolve(path.dirname(filename), value).replaceAll("\\", "/") : value;
    function dependency(node, source, names = []) {
      if (typeof source !== "string") return;
      const target = resolve(source);
      if (filename.includes("/src/lib/strength/") && !target.startsWith(sourceRoot + "lib/strength/")) {
        context.report({ node, messageId: "pure" });
      }
      if (!evalPath.test(filename) && evalPath.test(target)) context.report({ node, messageId: "eval" });
      if (protectedConsumer.test(filename)
        && ((/\/strength\/progression(?:\.ts)?$/.test(target) && names.some(n => ["*", "sessionTarget", "selectProgressionReference"].includes(n)))
          || (/\/effective-workout-target(?:\.ts)?$/.test(target) && names.some(n => ["*", "resolveEffectiveWorkoutTarget"].includes(n))))) {
        context.report({ node, messageId: "target" });
      }
    }
    function secret(node, name) {
      if (!evalPath.test(filename) && secrets.has(name)) context.report({ node, messageId: "secret" });
    }
    return {
      ImportDeclaration(node) { dependency(node, node.source.value, node.specifiers.map(s => s.type === "ImportNamespaceSpecifier" ? "*" : propertyName(s.imported))); },
      ExportNamedDeclaration(node) { if (node.source) dependency(node, node.source.value, node.specifiers.map(s => propertyName(s.local))); },
      ExportAllDeclaration(node) { dependency(node, node.source.value, ["*"]); },
      ImportExpression(node) { dependency(node, node.source.value, ["*"]); },
      CallExpression(node) { if (node.callee.type === "Identifier" && node.callee.name === "require") dependency(node, node.arguments[0]?.value, ["*"]); },
      MemberExpression(node) { secret(node, propertyName(node.property)); },
      Property(node) { secret(node, propertyName(node.key)); },
    };
  },
};

export default architectureBoundary;
