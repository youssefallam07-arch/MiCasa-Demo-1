// Centcom is the ONLY thing that imports the mainframe. Apps talk to Centcom over
// HTTP and never see this. Imported by relative path so tsx transpiles the sibling
// package's TypeScript directly (no build step).
export * from '../../mainframe/src/index';
