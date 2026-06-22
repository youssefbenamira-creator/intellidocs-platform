export default function DecisionMakerDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Executive Dashboard</h1>
        <p className="text-neutral-400 mt-2">High-level insights extracted from organizational knowledge.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800">
          <h3 className="text-neutral-400 text-sm font-medium">Total Documents Processed</h3>
          <p className="text-4xl font-bold mt-2 text-white">0</p>
        </div>
        <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800">
          <h3 className="text-neutral-400 text-sm font-medium">Key Identifiers Found</h3>
          <p className="text-4xl font-bold mt-2 text-orange-400">0</p>
        </div>
        <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800">
          <h3 className="text-neutral-400 text-sm font-medium">Risk Alerts</h3>
          <p className="text-4xl font-bold mt-2 text-rose-500">0</p>
        </div>
      </div>
    </div>
  );
}
