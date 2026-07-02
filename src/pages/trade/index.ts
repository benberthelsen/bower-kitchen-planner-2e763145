export { default as TradeDashboard } from './TradeDashboard';
export { default as JobEditor } from './JobEditor';
export { default as ProductCatalog } from './ProductCatalog';
// ProductConfigurator and RoomPlanner are NOT re-exported here —
// they import @react-three/drei and must stay behind React.lazy() in App.tsx.
// Any barrel re-export here would pull drei into the eager startup bundle.
export { default as MyJobs } from './MyJobs';
export { default as HardwareStore } from './HardwareStore';
export { default as TradeSettings } from './TradeSettings';
