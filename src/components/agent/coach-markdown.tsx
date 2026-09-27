import { parseCoachMarkdown, type Inline } from "@/lib/agent/markdown";
import { cx } from "@/components/ui/cx";

export function CoachMarkdown({ body }: { body: string }) {
  const blocks = parseCoachMarkdown(body);
  if (blocks.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, index) =>
        block.type === "list" ? (
          <ul key={index} className="list-disc space-y-1 pl-4">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inlines inlines={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <Inlines inlines={block.inlines} />
          </p>
        ),
      )}
    </div>
  );
}

function Inlines({ inlines }: { inlines: Inline[] }) {
  return inlines.map((inline, index) => {
    if (inline.type === "gain") {
      return (
        <span key={index} className={cx("text-overload-up", inline.strong && "font-semibold")}>
          {inline.value}
        </span>
      );
    }
    if (inline.type === "strong") {
      return (
        <strong key={index} className="font-semibold">
          {inline.value}
        </strong>
      );
    }
    return <span key={index}>{inline.value}</span>;
  });
}
