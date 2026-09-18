import "./prototype.css";
import { UxPrototype } from "./studio";
import { normalizeVariant } from "./variant";

export const metadata = {
  title: "Throwaway UX prototype",
  robots: { index: false, follow: false },
};

export default async function PrototypeUxPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const { variant } = await searchParams;
  return <UxPrototype variant={normalizeVariant(variant)} />;
}
