// Formula parser for Microvellum-style dimension formulas

import { FormulaVariables, EdgeSpec } from './types';

/**
 * Parse and evaluate a dimension formula
 * Supports: +, -, *, /, (), variables, and numbers
 * Example: "CabHeight*(1/3)" or "CabWidth-CarcaseThick*2"
 */
export function parseFormula(formula: string | null, vars: FormulaVariables): number {
  if (!formula || formula.trim() === '') return 0;

  try {
    // Replace variable names with their values
    let expression = formula;
    
    // Sort by length descending to replace longer variable names first
    const varNames = Object.keys(vars).sort((a, b) => b.length - a.length);
    
    for (const varName of varNames) {
      const regex = new RegExp(`\\b${varName}\\b`, 'g');
      expression = expression.replace(regex, String(vars[varName]));
    }
    
    // Remove any whitespace
    expression = expression.replace(/\s/g, '');
    
    // Validate expression contains only allowed characters. Anything left that
    // looks like an identifier is a variable this parser does not define — that
    // silently produced a 0-area part (and so a $0 panel), so name it loudly.
    if (!/^[\d+\-*/().]+$/.test(expression)) {
      const unknown = [...new Set(expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])];
      if (unknown.length) {
        console.warn(
          `Formula "${formula}" references undefined variable(s): ${unknown.join(', ')} — part sized 0`);
      } else {
        console.warn(`Invalid formula expression: ${formula} -> ${expression}`);
      }
      return 0;
    }
    
    // Evaluate the expression safely
    const result = evaluateExpression(expression);
    
    // Round to 2 decimal places
    return Math.round(result * 100) / 100;
  } catch (error) {
    console.error(`Error parsing formula: ${formula}`, error);
    return 0;
  }
}

/**
 * Simple expression evaluator supporting +, -, *, /, ()
 */
function evaluateExpression(expr: string): number {
  // Handle parentheses first (recursively)
  while (expr.includes('(')) {
    expr = expr.replace(/\(([^()]+)\)/g, (_, inner) => {
      return String(evaluateExpression(inner));
    });
  }
  
  // Split by + and - (keeping operators)
  const addTerms = expr.split(/(?=[+-])/);
  
  let result = 0;
  for (const term of addTerms) {
    if (term === '') continue;
    
    // Handle multiplication and division within each term
    const mulDivResult = evaluateMulDiv(term);
    result += mulDivResult;
  }
  
  return result;
}

function evaluateMulDiv(expr: string): number {
  // Handle leading + or -
  let sign = 1;
  if (expr.startsWith('+')) {
    expr = expr.substring(1);
  } else if (expr.startsWith('-')) {
    sign = -1;
    expr = expr.substring(1);
  }
  
  // Split by * and /
  const parts = expr.split(/([*/])/);
  
  let result = parseFloat(parts[0]) || 0;
  
  for (let i = 1; i < parts.length; i += 2) {
    const operator = parts[i];
    const operand = parseFloat(parts[i + 1]) || 0;
    
    if (operator === '*') {
      result *= operand;
    } else if (operator === '/') {
      result = operand !== 0 ? result / operand : 0;
    }
  }
  
  return sign * result;
}

/**
 * Parse edging specification string
 * Format: "Len1/Wid1/Len2/Wid2" or "Len1/-/-/-"
 * "-" means no edge tape on that side
 */
export function parseEdgingSpec(edging: string | null): EdgeSpec {
  const defaultSpec: EdgeSpec = {
    len1: false,
    wid1: false,
    len2: false,
    wid2: false
  };
  
  if (!edging || edging.trim() === '') return defaultSpec;
  
  const parts = edging.split('/');
  
  return {
    len1: parts[0] && parts[0] !== '-' && parts[0].trim() !== '',
    wid1: parts[1] && parts[1] !== '-' && parts[1].trim() !== '',
    len2: parts[2] && parts[2] !== '-' && parts[2].trim() !== '',
    wid2: parts[3] && parts[3] !== '-' && parts[3].trim() !== ''
  };
}

/**
 * Create formula variables from cabinet dimensions and global settings
 */
export function createFormulaVariables(
  cabinetDims: { width: number; height: number; depth: number },
  globalDims: {
    toeKickHeight: number;
    shelfSetback: number;
    doorGap: number;
    drawerGap: number;
    benchtopThickness: number;
  },
  options: {
    numDrawers?: number;
    numDoors?: number;
    numShelves?: number;
    carcaseThickness?: number;
    backThickness?: number;
    drawerHeight?: number;
    /** Corner cabinets: second wall run (MV "Cabinet Depth Left/Right"). */
    rightWidth?: number;
    rightDepth?: number;
    /** Drawer runner geometry from the selected hardware_pricing row. */
    drawerRunnerHeight?: number;
    drawerRunnerDepth?: number;
  } = {}
): FormulaVariables {
  const carcaseThick = options.carcaseThickness ?? 16;
  // Corner arms default to the cabinet's own footprint, which is correct for
  // every non-corner product and a safe fallback for corners whose second run
  // was not supplied.
  const rightWidth = options.rightWidth ?? cabinetDims.width;
  const rightDepth = options.rightDepth ?? cabinetDims.depth;
  return {
    CabWidth: cabinetDims.width,
    CabHeight: cabinetDims.height,
    CabDepth: cabinetDims.depth,
    CabLeftWidth: cabinetDims.width, // For L-shaped corners
    CabLeftDepth: cabinetDims.depth,
    CabRightWidth: rightWidth,
    CabRightDepth: rightDepth,
    // Corner drawer bank: half the clear opening (parts use LsCabDrawerWidth*2).
    LsCabDrawerWidth: Math.max(0, (cabinetDims.width - carcaseThick * 2) / 2),
    // Runner depth defaults to the deepest runner that fits the carcase, in
    // 50mm steps, which is what the shop actually orders.
    DrawerRunnerDepth:
      options.drawerRunnerDepth ?? Math.max(250, Math.floor((cabinetDims.depth - 55) / 50) * 50),
    DrawerRunnerHeight: options.drawerRunnerHeight ?? (options.drawerHeight ?? 140),
    CarcaseThick: carcaseThick,
    ShelfOffset: globalDims.shelfSetback,
    DoorGap: globalDims.doorGap,
    DrawerGap: globalDims.drawerGap,
    ToeKickHeight: globalDims.toeKickHeight,
    BenchtopThickness: globalDims.benchtopThickness,
    BackThickness: options.backThickness ?? 3,
    DrawerHeight: options.drawerHeight ?? 140,
    DrawerFrontHeight: 0, // Calculated based on drawer count
    NumDrawers: options.numDrawers ?? 0,
    NumDoors: options.numDoors ?? 0,
    NumShelves: options.numShelves ?? 1
  };
}
