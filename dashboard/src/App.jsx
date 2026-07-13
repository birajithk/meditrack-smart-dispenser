import "./App.css";
import ScheduleForm from "./components/ScheduleForm";
import ScheduleTable from "./components/ScheduleTable";
import DeviceStatus from "./components/DeviceStatus";
import DoseLogs from "./components/DoseLogs";
import SimulationControl from "./components/SimulationControl";

function App() {
  return (
    <div className="app">
      <header>
        <h1>MediTrack Dashboard</h1>
        <p>Smart medicine dispenser monitoring system</p>
      </header>

      <main>
        <ScheduleForm />
        <ScheduleTable />
        <SimulationControl />
        <DeviceStatus />
        <DoseLogs />
      </main>
    </div>
  );
}

export default App;