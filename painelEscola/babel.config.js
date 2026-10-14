const fs = require("fs");
const path = require("path");

/** Nome exportado do Lucide → arquivo do ícone. Evita o Metro puxar a biblioteca inteira. */
function lucideIconFiles() {
  const barrel = path.join(__dirname, "node_modules/lucide-react-native/dist/esm/lucide-react-native.mjs");
  const source = fs.readFileSync(barrel, "utf8");
  const files = new Map();
  const re = /export \{([^}]+)\} from '(\.\/icons\/[^']+)'/g;
  let match;
  while ((match = re.exec(source))) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(" as ").pop().trim();
      if (name) files.set(name, match[2].replace(/^\.\//, ""));
    }
  }
  return files;
}

const lucideIcons = lucideIconFiles();

function lucideDirectImports({ types: t }) {
  return {
    name: "lucide-direct-imports",
    visitor: {
      ImportDeclaration(p) {
        if (p.node.source.value !== "lucide-react-native" || p.node.importKind === "type") return;
        const next = [];
        for (const spec of p.node.specifiers) {
          if (spec.type !== "ImportSpecifier" || spec.importKind === "type") continue;
          const imported = spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value;
          const file = lucideIcons.get(imported);
          if (!file) throw p.buildCodeFrameError(`Ícone ${imported} não existe em lucide-react-native`);
          next.push(t.importDeclaration(
            [t.importDefaultSpecifier(t.identifier(spec.local.name))],
            t.stringLiteral(`lucide-react-native/dist/esm/${file}`),
          ));
        }
        if (next.length) p.replaceWithMultiple(next);
        else p.remove();
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      "babel-plugin-transform-import-meta",
      lucideDirectImports,
    ],
  };
};
