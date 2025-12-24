import { PlannerProvider } from "@/store/PlannerContext";

const TradePlannerContent = () => {
  return (
    <div className="flex-1 flex items-center justify-center bg-muted/50">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-foreground">Trade Planner</h1>
        <p className="text-muted-foreground">
          Coming soon - Advanced features for trade professionals
        </p>
      </div>
    </div>
  );
};

const TradePlanner = () => {
  return (
    <PlannerProvider>
      <TradePlannerContent />
    </PlannerProvider>
  );
};

export default TradePlanner;
