import Link from "next/link";

export default function ReviewsPage() {
  return (
    <main
      className="min-h-screen px-8 py-16"
      style={{ backgroundColor: "#faf8f6" }}
    >
      <p className="text-[15px] font-normal leading-[1.65]" style={{ color: "#6b5e55" }}>
        All Reviews — placeholder.
      </p>
      <Link
        href="/projects"
        className="mt-4 inline-block text-[13px] font-medium leading-[1.5]"
        style={{ color: "#6b1e2e", letterSpacing: "0.26px" }}
      >
        Back to Projects
      </Link>
    </main>
  );
}
