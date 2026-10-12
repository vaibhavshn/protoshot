import { Badge } from "./components/Badge";
import { Banner } from "./components/Banner";
import { Button } from "./components/Button";

export default function App() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <h1 className="text-3xl font-bold">Primitives</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Buttons</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Banners</h2>
        <Banner title="Heads up">Informational message.</Banner>
        <Banner variant="success" title="Saved">
          Your changes were saved.
        </Banner>
        <Banner variant="warning" title="Careful">
          This action is risky.
        </Banner>
        <Banner variant="error" title="Error">
          Something went wrong.
        </Banner>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Badges</h2>
        <div className="flex gap-2">
          <Badge>Neutral</Badge>
          <Badge variant="brand">Brand</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="danger">Danger</Badge>
        </div>
      </section>
    </main>
  );
}
