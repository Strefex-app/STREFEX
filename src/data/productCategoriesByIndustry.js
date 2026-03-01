/**
 * Product & Component manufacturing categories — industry-specific.
 * Each industry has its own curated set of relevant product categories
 * with tailored descriptions and manufacturing sub-processes.
 *
 * This ensures suppliers clearly understand which industry and product
 * area they are registering for.
 */

export const PRODUCT_CATEGORIES_BY_INDUSTRY = {
  /* ─────────────────────────────── AUTOMOTIVE ─────────────────────────────── */
  automotive: [
    {
      id: 'plastic',
      name: 'Plastic Parts',
      description: 'Automotive plastic components — bumpers, dashboards, trim, lighting, fluid reservoirs',
      color: '#1565c0',
      subcategories: [
        { id: 'plastic-injection', name: 'Plastic Injection Molding', description: 'Interior/exterior trim, dashboards, door panels, light housings' },
        { id: 'blow-molding', name: 'Blow Molding', description: 'Fuel tanks, fluid reservoirs, air ducts, HVAC components' },
        { id: 'thermoforming', name: 'Thermoforming', description: 'Interior liners, trunk covers, protective panels' },
        { id: 'compression-molding-plastic', name: 'Compression Molding', description: 'Under-the-hood structural parts, SMC/BMC components' },
        { id: 'extrusion-plastic', name: 'Extrusion', description: 'Sealing profiles, trim strips, cable conduits' },
        { id: '3d-printing-plastic', name: '3D Printing (Plastic)', description: 'Prototypes, jigs, fixtures, low-volume parts' },
      ],
    },
    {
      id: 'metal',
      name: 'Metal Parts',
      description: 'Automotive metal components — chassis, brackets, engine parts, structural elements',
      color: '#546e7a',
      subcategories: [
        { id: 'stamping', name: 'Stamping', description: 'Body panels, brackets, structural stampings, chassis parts' },
        { id: 'die-casting', name: 'Die-casting', description: 'Engine blocks, transmission housings, structural nodes' },
        { id: 'cnc-machining', name: 'CNC Machining', description: 'Precision engine parts, brake components, suspension parts' },
        { id: 'forging', name: 'Forging', description: 'Crankshafts, connecting rods, steering knuckles, axle shafts' },
        { id: 'sheet-metal', name: 'Sheet Metal Fabrication', description: 'Brackets, exhaust shields, structural frames' },
        { id: 'welding', name: 'Welding', description: 'Body-in-white, exhaust systems, structural assemblies' },
        { id: 'turning', name: 'Turning / Lathe', description: 'Shafts, pins, bushings, brake pistons' },
      ],
    },
    {
      id: 'rubber',
      name: 'Rubber & Sealing',
      description: 'Automotive rubber — seals, gaskets, hoses, bushings, vibration mounts',
      color: '#4e342e',
      subcategories: [
        { id: 'rubber-injection', name: 'Rubber Injection Molding', description: 'Grommets, mounts, bellows, connector seals' },
        { id: 'rubber-compression', name: 'Compression Molding', description: 'Gaskets, O-rings, dampers, engine mounts' },
        { id: 'rubber-extrusion', name: 'Extrusion', description: 'Door seals, window seals, weatherstripping profiles' },
        { id: 'rubber-to-metal', name: 'Rubber-to-Metal Bonding', description: 'Engine mounts, suspension bushings, vibration dampers' },
      ],
    },
    {
      id: 'glass',
      name: 'Glass',
      description: 'Automotive glass — windshields, windows, mirrors, lighting optics',
      color: '#00838f',
      subcategories: [
        { id: 'glass-tempering', name: 'Tempering', description: 'Side windows, rear windows, sunroof glass' },
        { id: 'glass-lamination', name: 'Lamination', description: 'Windshields, HUD-compatible glass, acoustic lamination' },
        { id: 'glass-molding', name: 'Glass Molding', description: 'Headlamp lenses, sensor covers' },
      ],
    },
    {
      id: 'composites',
      name: 'Composites',
      description: 'Automotive composites — body panels, spoilers, structural reinforcements',
      color: '#2e7d32',
      subcategories: [
        { id: 'carbon-fiber', name: 'Carbon Fiber Layup', description: 'Roof panels, spoilers, structural reinforcements, race parts' },
        { id: 'fiberglass', name: 'Fiberglass (GRP/FRP)', description: 'Body panels, underbody shields, truck bed liners' },
        { id: 'rtm', name: 'Resin Transfer Molding (RTM)', description: 'Structural parts, cross members, door modules' },
      ],
    },
    {
      id: 'electronics-assembly',
      name: 'Electronics & Wiring',
      description: 'Automotive electronics — wire harnesses, ECUs, sensor assemblies',
      color: '#6a1b9a',
      subcategories: [
        { id: 'wire-harness', name: 'Wire Harness', description: 'Main body harness, engine harness, door harness, ADAS cables' },
        { id: 'pcb-assembly', name: 'PCB Assembly', description: 'ECU boards, sensor modules, infotainment electronics' },
        { id: 'cable-assembly', name: 'Cable Assembly', description: 'EV high-voltage cables, charge connectors, antenna cables' },
      ],
    },
    {
      id: 'textile',
      name: 'Textile & Interior',
      description: 'Automotive textiles — seat covers, headliners, acoustic insulation, carpets',
      color: '#ad1457',
      subcategories: [
        { id: 'weaving', name: 'Weaving', description: 'Seat fabrics, door panel inserts, safety belt webbing' },
        { id: 'nonwoven', name: 'Nonwoven', description: 'Acoustic insulation, trunk lining, headliner substrates' },
        { id: 'coating-textile', name: 'Coating / Lamination', description: 'Coated fabrics for airbags, seat covers, sun visors' },
      ],
    },
  ],

  /* ─────────────────────────────── MACHINERY ──────────────────────────────── */
  machinery: [
    {
      id: 'metal',
      name: 'Metal Parts',
      description: 'Machinery metal components — shafts, gears, housings, frames, precision parts',
      color: '#546e7a',
      subcategories: [
        { id: 'cnc-machining', name: 'CNC Machining', description: 'Housings, blocks, manifolds, precision components' },
        { id: 'turning', name: 'Turning / Lathe', description: 'Shafts, spindles, rollers, precision pins' },
        { id: 'milling', name: 'Milling', description: 'Plates, brackets, complex 3D-profiled parts' },
        { id: 'grinding', name: 'Grinding', description: 'Bearing surfaces, gears, high-precision shafts' },
        { id: 'edm', name: 'EDM (Electrical Discharge)', description: 'Mold inserts, dies, complex cavities, hardened parts' },
        { id: 'forging', name: 'Forging', description: 'Gears, axles, heavy-duty structural components' },
        { id: 'sheet-metal', name: 'Sheet Metal Fabrication', description: 'Machine enclosures, guards, frames, cabinets' },
        { id: 'welding', name: 'Welding', description: 'Steel frames, machine bases, structural weldments' },
        { id: '3d-printing-metal', name: '3D Printing (Metal)', description: 'Tool inserts, conformal cooling, prototypes' },
      ],
    },
    {
      id: 'plastic',
      name: 'Plastic Parts',
      description: 'Machinery plastic components — covers, guides, insulators, wear pads',
      color: '#1565c0',
      subcategories: [
        { id: 'plastic-injection', name: 'Plastic Injection Molding', description: 'Machine covers, control panel housings, guides, rollers' },
        { id: 'extrusion-plastic', name: 'Extrusion', description: 'Cable trays, profiles, guide rails, wear strips' },
        { id: '3d-printing-plastic', name: '3D Printing (Plastic)', description: 'Prototypes, jigs, custom fixtures, low-volume parts' },
      ],
    },
    {
      id: 'rubber',
      name: 'Rubber & Sealing',
      description: 'Machinery rubber — seals, gaskets, dampers, vibration isolators',
      color: '#4e342e',
      subcategories: [
        { id: 'rubber-compression', name: 'Compression Molding', description: 'Gaskets, O-rings, vibration mounts, custom seals' },
        { id: 'rubber-extrusion', name: 'Extrusion', description: 'Sealing profiles, tubing, protective bellows' },
        { id: 'vulcanization', name: 'Vulcanization', description: 'Rollers, conveyor belting, rubber linings' },
      ],
    },
    {
      id: 'ceramics',
      name: 'Ceramics',
      description: 'Technical ceramics — wear parts, bearings, nozzles, thermal shields',
      color: '#e65100',
      subcategories: [
        { id: 'ceramic-sintering', name: 'Sintering', description: 'Wear rings, bearing sleeves, cutting inserts' },
        { id: 'ceramic-pressing', name: 'Pressing', description: 'Structural ceramic tiles, thermal shields, pads' },
        { id: 'ceramic-injection', name: 'Ceramic Injection Molding (CIM)', description: 'Precision nozzles, sensor housings, micro parts' },
      ],
    },
    {
      id: 'composites',
      name: 'Composites',
      description: 'Machinery composites — structural panels, guards, lightweight components',
      color: '#2e7d32',
      subcategories: [
        { id: 'carbon-fiber', name: 'Carbon Fiber Layup', description: 'Lightweight arms, spindle parts, high-speed components' },
        { id: 'fiberglass', name: 'Fiberglass (GRP/FRP)', description: 'Machine guards, enclosures, tanks, ducts' },
        { id: 'pultrusion', name: 'Pultrusion', description: 'Structural profiles, beams, guide rails' },
      ],
    },
  ],

  /* ─────────────────────────────── ELECTRONICS ────────────────────────────── */
  electronics: [
    {
      id: 'electronics-assembly',
      name: 'Electronics Assembly',
      description: 'Electronic assemblies — PCBs, SMT, cable assemblies, complete systems',
      color: '#6a1b9a',
      subcategories: [
        { id: 'pcb-assembly', name: 'PCB Assembly', description: 'Multi-layer PCB assembly, through-hole and mixed technology' },
        { id: 'smt-assembly', name: 'SMT Assembly', description: 'High-speed surface mount placement, BGA, QFN, 0201' },
        { id: 'cable-assembly', name: 'Cable Assembly', description: 'Custom cable harnesses, ribbon cables, RF cables' },
        { id: 'wire-harness', name: 'Wire Harness', description: 'Industrial wire harnesses, control panel wiring' },
        { id: 'box-build', name: 'Box Build / System Assembly', description: 'Full product assembly, testing, packaging, firmware' },
      ],
    },
    {
      id: 'plastic',
      name: 'Plastic Enclosures & Parts',
      description: 'Electronic plastic parts — enclosures, connectors, housings, insulators',
      color: '#1565c0',
      subcategories: [
        { id: 'plastic-injection', name: 'Plastic Injection Molding', description: 'Device housings, connector bodies, switch covers, bezels' },
        { id: '3d-printing-plastic', name: '3D Printing (Plastic)', description: 'Enclosure prototypes, custom fixtures, small-batch cases' },
        { id: 'extrusion-plastic', name: 'Extrusion', description: 'Cable ducts, LED diffuser profiles, protective tubing' },
      ],
    },
    {
      id: 'metal',
      name: 'Metal Parts & Shielding',
      description: 'Electronic metal parts — heatsinks, chassis, EMI shields, enclosures',
      color: '#546e7a',
      subcategories: [
        { id: 'stamping', name: 'Stamping', description: 'EMI shields, contacts, spring clips, battery tabs' },
        { id: 'cnc-machining', name: 'CNC Machining', description: 'Heatsinks, precision housings, test fixtures' },
        { id: 'die-casting', name: 'Die-casting', description: 'Aluminum enclosures, heatsink frames, structural parts' },
        { id: 'sheet-metal', name: 'Sheet Metal Fabrication', description: 'Rack enclosures, server chassis, control panel housings' },
      ],
    },
    {
      id: 'glass',
      name: 'Glass & Optics',
      description: 'Electronic optics — display glass, lenses, sensor covers, light guides',
      color: '#00838f',
      subcategories: [
        { id: 'optical', name: 'Optical Components', description: 'Camera lenses, sensor optics, laser components, prisms' },
        { id: 'glass-molding', name: 'Glass Molding', description: 'Display cover glass, touch panel glass, sensor windows' },
      ],
    },
    {
      id: 'ceramics',
      name: 'Ceramics & Substrates',
      description: 'Electronic ceramics — substrates, insulators, RF components, piezo elements',
      color: '#e65100',
      subcategories: [
        { id: 'ceramic-injection', name: 'Ceramic Injection Molding (CIM)', description: 'Micro connectors, sensor housings, IC packages' },
        { id: 'ceramic-sintering', name: 'Sintering', description: 'LTCC/HTCC substrates, piezo elements, thermal pads' },
      ],
    },
  ],

  /* ─────────────────────────────── MEDICAL ────────────────────────────────── */
  medical: [
    {
      id: 'plastic',
      name: 'Plastic Parts (Medical Grade)',
      description: 'Medical-grade plastic — syringes, tubing, housings, implantable components',
      color: '#1565c0',
      subcategories: [
        { id: 'plastic-injection', name: 'Plastic Injection Molding', description: 'Syringe barrels, inhaler housings, IV connectors (cleanroom)' },
        { id: 'blow-molding', name: 'Blow Molding', description: 'Fluid containers, drip chambers, disposable bottles' },
        { id: 'extrusion-plastic', name: 'Extrusion', description: 'Medical tubing, catheters, drainage tubes' },
        { id: '3d-printing-plastic', name: '3D Printing (Plastic)', description: 'Patient-specific implants, surgical guides, prosthetics' },
      ],
    },
    {
      id: 'metal',
      name: 'Metal Parts (Medical Grade)',
      description: 'Medical-grade metal — surgical instruments, implants, device components',
      color: '#546e7a',
      subcategories: [
        { id: 'cnc-machining', name: 'CNC Machining', description: 'Surgical instruments, orthopedic implants, dental abutments' },
        { id: 'turning', name: 'Turning / Lathe', description: 'Bone screws, pins, cannulas, precision shafts' },
        { id: 'edm', name: 'EDM (Electrical Discharge)', description: 'Micro-features for stents, spinal implants, biopsy tools' },
        { id: '3d-printing-metal', name: '3D Printing (Metal)', description: 'Patient-specific implants, porous bone scaffolds, titanium parts' },
      ],
    },
    {
      id: 'rubber',
      name: 'Rubber & Silicone (Medical Grade)',
      description: 'Medical rubber — biocompatible seals, tubing, grips, flexible components',
      color: '#4e342e',
      subcategories: [
        { id: 'rubber-injection', name: 'Silicone / Rubber Injection', description: 'Valve seats, diaphragms, respiratory masks, implant seals' },
        { id: 'rubber-compression', name: 'Compression Molding', description: 'O-rings, stoppers, gaskets for sterile packaging' },
        { id: 'rubber-extrusion', name: 'Extrusion', description: 'Silicone tubing, peristaltic pump tubes, drainage tubes' },
      ],
    },
    {
      id: 'ceramics',
      name: 'Ceramics (Biocompatible)',
      description: 'Biocompatible ceramics — implants, dental crowns, coatings',
      color: '#e65100',
      subcategories: [
        { id: 'ceramic-injection', name: 'Ceramic Injection Molding (CIM)', description: 'Dental crowns, zirconia bridges, micro-implants' },
        { id: 'ceramic-sintering', name: 'Sintering', description: 'Hip joints, bone grafts, hydroxyapatite coatings' },
        { id: 'ceramic-pressing', name: 'Pressing', description: 'Alumina substrates, piezo sensor elements' },
      ],
    },
    {
      id: 'glass',
      name: 'Glass & Optics (Medical)',
      description: 'Medical glass — vials, ampoules, lenses, endoscope optics',
      color: '#00838f',
      subcategories: [
        { id: 'glass-molding', name: 'Glass Molding', description: 'Vials, ampoules, prefilled syringe barrels' },
        { id: 'optical', name: 'Optical Components', description: 'Endoscope lenses, microscopy optics, laser components' },
      ],
    },
    {
      id: 'electronics-assembly',
      name: 'Electronics (Medical Devices)',
      description: 'Medical electronics — sensor modules, monitoring PCBs, implant electronics',
      color: '#6a1b9a',
      subcategories: [
        { id: 'pcb-assembly', name: 'PCB Assembly', description: 'Patient monitors, diagnostic devices, infusion pumps (IPC Class 3)' },
        { id: 'cable-assembly', name: 'Cable Assembly', description: 'Patient cables, sensor leads, electrosurgery cords' },
      ],
    },
    {
      id: 'textile',
      name: 'Textile (Medical)',
      description: 'Medical textiles — surgical gowns, wound care, implantable meshes',
      color: '#ad1457',
      subcategories: [
        { id: 'nonwoven', name: 'Nonwoven', description: 'Surgical drapes, face masks, wound dressings, filters' },
        { id: 'weaving', name: 'Weaving', description: 'Implantable meshes, hernia repair, vascular grafts' },
      ],
    },
  ],

  /* ─────────────────────────── RAW MATERIALS ──────────────────────────────── */
  'raw-materials': [
    {
      id: 'plastic-resins',
      name: 'Plastic Resins & Polymers',
      description: 'Raw plastic materials — engineering resins, commodity polymers, specialty compounds',
      color: '#1565c0',
      subcategories: [
        { id: 'commodity-plastics', name: 'Commodity Plastics', description: 'PP, PE, PS, PVC — general-purpose resins' },
        { id: 'engineering-plastics', name: 'Engineering Plastics', description: 'PA, POM, PC, PBT, ABS — structural applications' },
        { id: 'high-performance', name: 'High-Performance Polymers', description: 'PEEK, PPS, PEI, LCP — extreme conditions' },
        { id: 'compounds', name: 'Custom Compounds', description: 'Glass-filled, flame-retardant, conductive compounds' },
        { id: 'masterbatch', name: 'Masterbatch & Additives', description: 'Color masterbatch, UV stabilizers, processing aids' },
      ],
    },
    {
      id: 'metals-alloys',
      name: 'Metals & Alloys',
      description: 'Raw metals — steel, aluminum, copper, titanium, specialty alloys',
      color: '#546e7a',
      subcategories: [
        { id: 'steel', name: 'Steel & Stainless Steel', description: 'Carbon steel, tool steel, stainless grades (304, 316, 17-4PH)' },
        { id: 'aluminum', name: 'Aluminum Alloys', description: '6061, 7075, die-cast alloys, extrusion billets' },
        { id: 'copper', name: 'Copper & Brass', description: 'Electrolytic copper, CuBe alloys, brass rod/sheet' },
        { id: 'titanium', name: 'Titanium', description: 'Grade 2, Grade 5 (Ti6Al4V), medical and aerospace grades' },
        { id: 'specialty-metals', name: 'Specialty Metals', description: 'Inconel, Hastelloy, tungsten, molybdenum, cobalt-chrome' },
      ],
    },
    {
      id: 'rubber-elastomers',
      name: 'Rubber & Elastomers',
      description: 'Raw rubber — natural rubber, silicone, EPDM, NBR, FKM compounds',
      color: '#4e342e',
      subcategories: [
        { id: 'natural-rubber', name: 'Natural Rubber', description: 'NR sheets, latex, SMR grades' },
        { id: 'synthetic-rubber', name: 'Synthetic Rubber', description: 'SBR, NBR, EPDM, CR — general-purpose synthetic' },
        { id: 'silicone', name: 'Silicone Rubber', description: 'HTV, LSR, RTV silicone compounds' },
        { id: 'fluoroelastomers', name: 'Fluoroelastomers (FKM)', description: 'Viton, Kalrez — chemical and heat resistant' },
      ],
    },
    {
      id: 'chemicals',
      name: 'Chemicals & Additives',
      description: 'Industrial chemicals — solvents, catalysts, processing aids, fillers',
      color: '#7b1fa2',
      subcategories: [
        { id: 'solvents', name: 'Solvents & Cleaning Agents', description: 'Industrial solvents, degreasers, cleaning chemicals' },
        { id: 'catalysts', name: 'Catalysts & Curing Agents', description: 'Peroxides, crosslinkers, hardeners, accelerators' },
        { id: 'fillers', name: 'Fillers & Reinforcements', description: 'Calcium carbonate, glass fibers, carbon black, talc' },
      ],
    },
    {
      id: 'composites-fibers',
      name: 'Composites & Fibers',
      description: 'Fiber reinforcements — carbon fiber, glass fiber, aramid, prepregs',
      color: '#2e7d32',
      subcategories: [
        { id: 'carbon-fiber-raw', name: 'Carbon Fiber', description: 'Tow, fabric, chopped, milled carbon fiber' },
        { id: 'glass-fiber-raw', name: 'Glass Fiber', description: 'E-glass, S-glass roving, mat, woven fabrics' },
        { id: 'prepreg-raw', name: 'Prepregs', description: 'Epoxy prepreg, phenolic prepreg, thermoplastic tapes' },
        { id: 'resins-raw', name: 'Matrix Resins', description: 'Epoxy, polyester, vinyl ester, phenolic resins' },
      ],
    },
    {
      id: 'adhesives',
      name: 'Adhesives & Sealants',
      description: 'Industrial adhesives — structural, flexible, anaerobic, UV-cure, sealants',
      color: '#e65100',
      subcategories: [
        { id: 'structural-adhesives', name: 'Structural Adhesives', description: 'Epoxy, acrylic, polyurethane structural bonding' },
        { id: 'sealants-raw', name: 'Sealants', description: 'Silicone, polyurethane, polysulfide sealants' },
        { id: 'specialty-adhesives', name: 'Specialty Adhesives', description: 'UV-cure, anaerobic, cyanoacrylate, hot melt' },
      ],
    },
    {
      id: 'coatings',
      name: 'Coatings & Surface Treatment',
      description: 'Industrial coatings — paints, powder coat, anodizing, plating chemistries',
      color: '#00838f',
      subcategories: [
        { id: 'paints', name: 'Industrial Paints', description: 'Primer, topcoat, cataphoresis (e-coat), water-based' },
        { id: 'powder-coating', name: 'Powder Coating', description: 'Epoxy, polyester, hybrid powder coatings' },
        { id: 'plating', name: 'Plating Chemistries', description: 'Zinc, nickel, chrome, gold plating solutions' },
      ],
    },
  ],

  /* ──────────────────────────────── OIL & GAS ─────────────────────────────── */
  'oil-gas': [
    {
      id: 'metal',
      name: 'Metal Parts & Fabrication',
      description: 'Oil & gas metal — pipes, valves, vessels, flanges, subsea components',
      color: '#546e7a',
      subcategories: [
        { id: 'forging', name: 'Forging', description: 'Valve bodies, flanges, wellhead components, high-pressure fittings' },
        { id: 'cnc-machining', name: 'CNC Machining', description: 'Precision valve components, pump housings, actuator parts' },
        { id: 'welding', name: 'Welding', description: 'Pressure vessels, pipeline welding, subsea structures (ASME/AWS)' },
        { id: 'turning', name: 'Turning / Lathe', description: 'Drill collars, tool joints, downhole tool components' },
        { id: 'sheet-metal', name: 'Sheet Metal Fabrication', description: 'Tank shells, ducting, platform structural elements' },
        { id: 'die-casting', name: 'Casting', description: 'Pump impellers, valve bodies, manifold blocks' },
      ],
    },
    {
      id: 'rubber',
      name: 'Rubber & Sealing',
      description: 'Oil & gas rubber — high-pressure seals, BOP seals, gaskets, hoses',
      color: '#4e342e',
      subcategories: [
        { id: 'rubber-compression', name: 'Compression Molding', description: 'BOP seals, packer elements, high-pressure gaskets' },
        { id: 'rubber-extrusion', name: 'Extrusion', description: 'Hydraulic hoses, umbilical tubing, chemical-resistant profiles' },
        { id: 'rubber-to-metal', name: 'Rubber-to-Metal Bonding', description: 'Vibration isolators, swab cups, bonded seals' },
      ],
    },
    {
      id: 'composites',
      name: 'Composites',
      description: 'Oil & gas composites — corrosion-resistant pipes, tanks, structural GRP',
      color: '#2e7d32',
      subcategories: [
        { id: 'fiberglass', name: 'Fiberglass (GRP/FRP)', description: 'Corrosion-resistant piping, tanks, gratings, handrails' },
        { id: 'rtm', name: 'Resin Transfer Molding (RTM)', description: 'Structural panels, covers, downhole components' },
        { id: 'pultrusion', name: 'Pultrusion', description: 'Fiberglass rods, profiles, cable trays, sucker rods' },
      ],
    },
    {
      id: 'ceramics',
      name: 'Ceramics & Wear Parts',
      description: 'Oil & gas ceramics — wear liners, flow control inserts, thermal barriers',
      color: '#e65100',
      subcategories: [
        { id: 'ceramic-sintering', name: 'Sintering', description: 'Wear liners, flow control chokes, thermal barriers' },
        { id: 'ceramic-pressing', name: 'Pressing', description: 'Proppants, grinding media, insulating tiles' },
      ],
    },
    {
      id: 'electronics-assembly',
      name: 'Electronics & Instrumentation',
      description: 'Oil & gas electronics — downhole instruments, control systems, sensors',
      color: '#6a1b9a',
      subcategories: [
        { id: 'pcb-assembly', name: 'PCB Assembly', description: 'Downhole tool electronics, SCADA controllers, sensor modules' },
        { id: 'cable-assembly', name: 'Cable Assembly', description: 'Subsea umbilicals, control cables, high-temperature wiring' },
        { id: 'wire-harness', name: 'Wire Harness', description: 'Platform control panels, motor wiring, junction boxes' },
      ],
    },
  ],

  /* ─────────────────────────────── GREEN ENERGY ───────────────────────────── */
  'green-energy': [
    {
      id: 'metal',
      name: 'Metal Structures & Parts',
      description: 'Green energy metal — mounting frames, inverter enclosures, turbine shafts',
      color: '#546e7a',
      subcategories: [
        { id: 'sheet-metal', name: 'Sheet Metal Fabrication', description: 'Solar racking, inverter enclosures, battery cabinets' },
        { id: 'stamping', name: 'Stamping', description: 'Mounting brackets, electrical bus bars, connector terminals' },
        { id: 'cnc-machining', name: 'CNC Machining', description: 'Turbine shafts, gear components, precision fittings' },
        { id: 'welding', name: 'Welding', description: 'Tower sections, structural frames, tracker assemblies' },
      ],
    },
    {
      id: 'composites',
      name: 'Composites',
      description: 'Green energy composites — turbine blades, nacelle covers, structural panels',
      color: '#2e7d32',
      subcategories: [
        { id: 'fiberglass', name: 'Fiberglass (GRP/FRP)', description: 'Wind turbine blades, nacelle covers, electrical enclosures' },
        { id: 'carbon-fiber', name: 'Carbon Fiber Layup', description: 'Large turbine blade spar caps, lightweight structures' },
        { id: 'pultrusion', name: 'Pultrusion', description: 'Cable trays, structural profiles, mounting rails' },
      ],
    },
    {
      id: 'glass',
      name: 'Glass (Solar)',
      description: 'Solar glass — PV cover glass, anti-reflective coatings, tempered panels',
      color: '#00838f',
      subcategories: [
        { id: 'glass-tempering', name: 'Tempering', description: 'Solar panel cover glass, tempered collector tubes' },
        { id: 'glass-lamination', name: 'Lamination', description: 'Bifacial PV glass, building-integrated PV (BIPV) glass' },
      ],
    },
    {
      id: 'electronics-assembly',
      name: 'Electronics & Power',
      description: 'Green energy electronics — inverters, charge controllers, BMS, monitoring',
      color: '#6a1b9a',
      subcategories: [
        { id: 'pcb-assembly', name: 'PCB Assembly', description: 'Inverter control boards, BMS modules, MPPT controllers' },
        { id: 'smt-assembly', name: 'SMT Assembly', description: 'Power electronics, high-current driver boards' },
        { id: 'cable-assembly', name: 'Cable Assembly', description: 'DC solar cables, EV charge cables, battery interconnects' },
        { id: 'wire-harness', name: 'Wire Harness', description: 'Turbine nacelle wiring, solar string harnesses' },
      ],
    },
    {
      id: 'plastic',
      name: 'Plastic Parts',
      description: 'Green energy plastic — junction boxes, connectors, cable protection',
      color: '#1565c0',
      subcategories: [
        { id: 'plastic-injection', name: 'Plastic Injection Molding', description: 'Junction boxes, MC4 connectors, cable glands' },
        { id: 'extrusion-plastic', name: 'Extrusion', description: 'Cable conduits, insulation profiles, edge seals' },
      ],
    },
    {
      id: 'rubber',
      name: 'Rubber & Sealing',
      description: 'Green energy rubber — weatherproof seals, dampers, insulation gaskets',
      color: '#4e342e',
      subcategories: [
        { id: 'rubber-extrusion', name: 'Extrusion', description: 'Panel edge seals, gaskets, cable grommets' },
        { id: 'rubber-compression', name: 'Compression Molding', description: 'Vibration dampers, weatherproof seals, O-rings' },
      ],
    },
  ],

  /* ─────────────────────────── HOUSEHOLD PRODUCTS ─────────────────────────── */
  'household-products': [
    {
      id: 'kitchen-appliances',
      name: 'Kitchen Appliances',
      description: 'Home appliance components for cooking, food preparation, and kitchen electronics',
      color: '#1565c0',
      subcategories: [
        { id: 'small-appliance-housing', name: 'Small Appliance Housings', description: 'Housings for blenders, mixers, toasters, coffee machines' },
        { id: 'heating-elements', name: 'Heating Elements', description: 'Heating modules for kettles, ovens, and cookers' },
        { id: 'motor-assemblies', name: 'Motor Assemblies', description: 'Compact motor assemblies for mixers, grinders, and extractors' },
        { id: 'control-panels', name: 'Control Panels & Buttons', description: 'User interfaces, touch panels, and control buttons' },
      ],
    },
    {
      id: 'home-electronics',
      name: 'Home Electronics',
      description: 'Consumer home electronics components and assemblies',
      color: '#6a1b9a',
      subcategories: [
        { id: 'pcb-assembly-home', name: 'PCB Assembly', description: 'Mainboards and control electronics for home devices' },
        { id: 'display-modules', name: 'Display Modules', description: 'LCD/LED display modules and indicator panels' },
        { id: 'sensor-modules-home', name: 'Sensor Modules', description: 'Temperature, humidity, and motion sensing modules' },
        { id: 'power-supplies-home', name: 'Power Supply Units', description: 'AC/DC power boards and adapters for household products' },
      ],
    },
    {
      id: 'plastic-housewares',
      name: 'Plastic Housewares',
      description: 'Plastic components for storage, cleaning, and household utility products',
      color: '#00838f',
      subcategories: [
        { id: 'injection-molded-containers', name: 'Injection Molded Containers', description: 'Boxes, bins, organizers, and storage containers' },
        { id: 'blow-molded-bottles', name: 'Blow Molded Bottles', description: 'Cleaning bottles, dispensers, and refill containers' },
        { id: 'plastic-closures', name: 'Closures & Caps', description: 'Caps, lids, closures, and snap-fit parts' },
        { id: 'extruded-profiles-home', name: 'Extruded Profiles', description: 'Seals, strips, and utility profiles for home products' },
      ],
    },
    {
      id: 'cleaning-care-products',
      name: 'Cleaning & Care Products',
      description: 'Components and packaging for household cleaning and care products',
      color: '#2e7d32',
      subcategories: [
        { id: 'sprayer-components', name: 'Sprayer Components', description: 'Triggers, nozzles, and pump dispensers' },
        { id: 'detergent-packaging', name: 'Detergent Packaging', description: 'Bottles, caps, and refill pack structures' },
        { id: 'nonwoven-cleaning', name: 'Nonwoven Cleaning Materials', description: 'Wipes, pads, and cleaning fabric components' },
        { id: 'brush-components', name: 'Brush & Mop Components', description: 'Brush heads, handles, and mop fixture components' },
      ],
    },
    {
      id: 'furniture-home-components',
      name: 'Furniture & Home Components',
      description: 'Household furniture and home fixture components',
      color: '#e65100',
      subcategories: [
        { id: 'metal-furniture-parts', name: 'Metal Furniture Parts', description: 'Frames, brackets, supports, and hardware fittings' },
        { id: 'wood-composite-panels', name: 'Wood & Composite Panels', description: 'Panels, cabinet boards, laminated structures' },
        { id: 'upholstery-textiles', name: 'Upholstery Textiles', description: 'Cover fabrics, cushioning, and stitched assemblies' },
        { id: 'surface-coatings-home', name: 'Surface Coatings', description: 'Paint, laminate, and protective coating systems' },
      ],
    },
  ],
}

/* ─────────────────────────────── Helper Functions ─────────────────────────── */

/**
 * Get product categories for a specific industry.
 * Returns only the categories relevant to that industry.
 */
export function getProductCategoriesForIndustry(industryId) {
  return PRODUCT_CATEGORIES_BY_INDUSTRY[industryId] || []
}

/**
 * Get a single manufacturing category by ID within a specific industry.
 * Industry context is required since categories differ across industries.
 */
export function getManufacturingCategory(categoryId, industryId) {
  const industryCategories = PRODUCT_CATEGORIES_BY_INDUSTRY[industryId] || []
  return industryCategories.find((c) => c.id === categoryId) || null
}

/**
 * Get subcategories for a specific manufacturing category within an industry.
 */
export function getSubcategories(categoryId, industryId) {
  const cat = getManufacturingCategory(categoryId, industryId)
  return cat ? cat.subcategories : []
}
