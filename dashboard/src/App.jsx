import { useState } from "react";
import "./App.css";
import DeviceList from "./components/DeviceList";
import ScheduleForm from "./components/ScheduleForm";
import ScheduleTable from "./components/ScheduleTable";
import DeviceStatus from "./components/DeviceStatus";
import DoseLogs from "./components/DoseLogs";

function App() {
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  return (
    <div className="app-shell">
      <div className="app-shell__glow app-shell__glow--one" aria-hidden="true" />
      <div className="app-shell__glow app-shell__glow--two" aria-hidden="true" />

      <header className="hero card">
        <div className="hero__copy">
          <p className="eyebrow">MediTrack Smart Dispenser</p>
          <h1>MediTrack dashboard</h1>
          <p className="hero__description">
            Monitor connected dispensers, plan medication schedules, and review
            delivery activity from one calm, focused workspace.
          </p>
        </div>

        <div className="hero__badges" aria-label="Dashboard highlights">
          <span className="badge">Firebase live sync</span>
          <span className="badge">Scheduling control</span>
          <span className="badge">Dose history</span>
        </div>
      </header>

      <main className="dashboard-grid">
        <aside className="dashboard-column dashboard-column--side">
          <DeviceList
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
          />

          <DeviceStatus deviceId={selectedDeviceId} />
        </aside>

        <section className="dashboard-column dashboard-column--main">
          <ScheduleForm deviceId={selectedDeviceId} />
          <ScheduleTable deviceId={selectedDeviceId} />
          <DoseLogs deviceId={selectedDeviceId} />
        </section>
      </main>
    </div>
  );
}

export default App;