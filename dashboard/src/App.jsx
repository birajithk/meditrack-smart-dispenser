import { useState } from "react";
import "./App.css";
import HomePage from "./components/HomePage";
import DeviceManagementPage from "./components/DeviceManagementPage";
import ScheduleManagementPage from "./components/ScheduleManagementPage";
import DoseLogsPage from "./components/DoseLogsPage";

function App() {
  const [activePage, setActivePage] = useState("home");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const pageTitles = {
    home: "Device overview",
    devices: "Device management",
    schedules: "Schedule management",
    logs: "Dose logs",
  };

  const openDevicesForDevice = (deviceId = selectedDeviceId) => {
    if (deviceId) {
      setSelectedDeviceId(deviceId);
    }

    setActivePage("devices");
  };

  const openSchedulesForDevice = (deviceId = selectedDeviceId) => {
    if (deviceId) {
      setSelectedDeviceId(deviceId);
    }

    setActivePage("schedules");
  };

  const openLogsForDevice = (deviceId = selectedDeviceId) => {
    if (deviceId) {
      setSelectedDeviceId(deviceId);
    }

    setActivePage("logs");
  };

  return (
    <div className="app-shell">
      <div className="app-shell__glow app-shell__glow--one" aria-hidden="true" />
      <div className="app-shell__glow app-shell__glow--two" aria-hidden="true" />

      <header className="hero card">
        <div className="hero__copy">
          <p className="eyebrow">MediTrack Smart Dispenser</p>
          <h1>{pageTitles[activePage]}</h1>
          <p className="hero__description">
            Monitor connected dispensers, manage compartment assignments and
            schedules, and review dose activity from one workspace.
          </p>
        </div>

        <div className="hero__badges hero__badges--stacked" aria-label="Dashboard navigation and selection">
          <div className="page-tabs" role="tablist" aria-label="Dashboard pages">
            <button
              type="button"
              className={activePage === "home" ? "tab-button active" : "tab-button"}
              onClick={() => setActivePage("home")}
            >
              Home
            </button>
            <button
              type="button"
              className={activePage === "devices" ? "tab-button active" : "tab-button"}
              onClick={() => setActivePage("devices")}
            >
              Devices
            </button>
            <button
              type="button"
              className={activePage === "schedules" ? "tab-button active" : "tab-button"}
              onClick={() => setActivePage("schedules")}
            >
              Schedules
            </button>
            <button
              type="button"
              className={activePage === "logs" ? "tab-button active" : "tab-button"}
              onClick={() => setActivePage("logs")}
            >
              Logs
            </button>
          </div>

          <span className="badge badge--selection">Selected device: {selectedDeviceId || "None"}</span>
        </div>
      </header>

      <main className="page-stack">
        {activePage === "home" && (
          <HomePage
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            onOpenDevices={openDevicesForDevice}
            onOpenSchedules={openSchedulesForDevice}
            onOpenLogs={openLogsForDevice}
          />
        )}

        {activePage === "devices" && (
          <DeviceManagementPage
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            onOpenSchedules={openSchedulesForDevice}
          />
        )}

        {activePage === "schedules" && (
          <ScheduleManagementPage
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
          />
        )}

        {activePage === "logs" && (
          <DoseLogsPage selectedDeviceId={selectedDeviceId} onSelectDevice={setSelectedDeviceId} />
        )}
      </main>
    </div>
  );
}

export default App;
