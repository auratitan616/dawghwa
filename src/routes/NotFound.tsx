import { Link } from "react-router-dom";
import { EmptyState } from "@/components/States";
import { useHead } from "@/lib/seo";

export default function NotFound() {
  useHead({ title: "Page not found", noindex: true });
  return (
    <div className="page page-narrow">
      <EmptyState title="This page doesn't exist" pose="error" center action={<Link className="btn btn-primary" to="/">Go home</Link>}>
        The link may be old, or the title moved.
      </EmptyState>
    </div>
  );
}
