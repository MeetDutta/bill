"""
Business Type Schemas & Field Configurations for Universal POS.
Enables dynamic adaptation of product fields, invoice columns, and search filters
based on the merchant's business type.
"""

BUSINESS_TYPE_DEFINITIONS = {
    "RETAIL": {
        "label": "Retail Store",
        "description": "General merchandise, gifts, packaged goods, departmental items",
        "default_tax_rate": 18.0,
        "default_unit": "PCS",
        "supported_units": ["PCS", "PKT", "BOX", "SET", "DOZEN"],
        "attributes": [
            {"key": "brand", "label": "Brand", "type": "text", "required": False, "searchable": True},
            {"key": "color", "label": "Color", "type": "text", "required": False, "searchable": True},
            {"key": "size", "label": "Size", "type": "text", "required": False, "searchable": True},
        ],
    },
    "HARDWARE": {
        "label": "Hardware & Sanitary",
        "description": "Paints, plumbing, sanitaryware, tools, fasteners, electrical fittings",
        "default_tax_rate": 18.0,
        "default_unit": "PCS",
        "supported_units": ["PCS", "BOX", "KG", "MTR", "LTR", "SET", "BAG", "BUCKET"],
        "attributes": [
            {"key": "brand", "label": "Brand / Manufacturer", "type": "text", "required": False, "searchable": True},
            {"key": "material", "label": "Material (Brass, Steel, PVC)", "type": "text", "required": False, "searchable": True},
            {"key": "size", "label": "Size / Dimension (e.g. 1/2 inch, 20L)", "type": "text", "required": False, "searchable": True},
            {"key": "grade", "label": "Grade / Standard (e.g. SS304, Grade 8)", "type": "text", "required": False, "searchable": False},
        ],
    },
    "JEWELLERY": {
        "label": "Jewellery & Gems",
        "description": "Gold, silver, diamond ornaments, bullion, gemstones",
        "default_tax_rate": 3.0,
        "default_unit": "GM",
        "supported_units": ["GM", "MG", "KG", "PCS", "CARAT"],
        "attributes": [
            {"key": "metal", "label": "Precious Metal", "type": "select", "options": ["Gold", "Silver", "Platinum", "Diamond", "Gemstone"], "required": True, "searchable": True},
            {"key": "purity", "label": "Purity (24K, 22K, 18K, 925)", "type": "text", "required": True, "searchable": True},
            {"key": "gross_weight", "label": "Gross Weight (grams)", "type": "number", "required": True, "searchable": False},
            {"key": "net_weight", "label": "Net Weight (grams)", "type": "number", "required": True, "searchable": False},
            {"key": "making_charges", "label": "Making Charges (₹)", "type": "number", "required": False, "searchable": False},
            {"key": "hallmark_number", "label": "HUID / Hallmark Number", "type": "text", "required": False, "searchable": True},
        ],
    },
    "AUTO_SPARES": {
        "label": "Auto Spare Parts",
        "description": "Vehicle parts, lubricants, batteries, tyres, accessories",
        "default_tax_rate": 18.0,
        "default_unit": "PCS",
        "supported_units": ["PCS", "SET", "LTR", "PAIR", "BOX"],
        "attributes": [
            {"key": "part_number", "label": "OEM / Part Number", "type": "text", "required": True, "searchable": True},
            {"key": "vehicle_brand", "label": "Vehicle Brand (e.g. Maruti, Hyundai, Tata)", "type": "text", "required": False, "searchable": True},
            {"key": "vehicle_model", "label": "Vehicle Model (e.g. Swift, Creta, Nexon)", "type": "text", "required": False, "searchable": True},
            {"key": "model_year", "label": "Applicable Year", "type": "text", "required": False, "searchable": False},
            {"key": "warranty_months", "label": "Warranty (Months)", "type": "number", "required": False, "searchable": False},
        ],
    },
    "ELECTRONICS": {
        "label": "Consumer Electronics & Appliances",
        "description": "Smartphones, laptops, home appliances, audio, cables",
        "default_tax_rate": 18.0,
        "default_unit": "PCS",
        "supported_units": ["PCS", "BOX", "SET"],
        "attributes": [
            {"key": "brand", "label": "Brand", "type": "text", "required": True, "searchable": True},
            {"key": "model_number", "label": "Model Number", "type": "text", "required": False, "searchable": True},
            {"key": "imei_serial", "label": "Serial / IMEI Number", "type": "text", "required": False, "searchable": True},
            {"key": "warranty_months", "label": "Warranty Period (Months)", "type": "number", "required": False, "searchable": False},
        ],
    },
    "GROCERY": {
        "label": "Grocery & Supermarket",
        "description": "Staples, packaged food, beverages, dairy, FMCG",
        "default_tax_rate": 5.0,
        "default_unit": "KG",
        "supported_units": ["KG", "GM", "LTR", "ML", "PCS", "PKT", "BAG", "BOX"],
        "attributes": [
            {"key": "brand", "label": "Brand", "type": "text", "required": False, "searchable": True},
            {"key": "batch_number", "label": "Batch Number", "type": "text", "required": False, "searchable": True},
            {"key": "expiry_date", "label": "Expiry Date", "type": "date", "required": False, "searchable": False},
        ],
    },
    "CLOTHING": {
        "label": "Clothing & Apparel",
        "description": "Garments, footwear, ethnic wear, fabrics, accessories",
        "default_tax_rate": 12.0,
        "default_unit": "PCS",
        "supported_units": ["PCS", "PAIR", "MTR", "SET"],
        "attributes": [
            {"key": "brand", "label": "Brand", "type": "text", "required": False, "searchable": True},
            {"key": "size", "label": "Size (S, M, L, XL, 32, 40)", "type": "text", "required": False, "searchable": True},
            {"key": "color", "label": "Color", "type": "text", "required": False, "searchable": True},
            {"key": "fabric", "label": "Fabric (Cotton, Silk, Denim, Linen)", "type": "text", "required": False, "searchable": True},
            {"key": "gender", "label": "Category (Men, Women, Kids, Unisex)", "type": "select", "options": ["Men", "Women", "Kids", "Unisex"], "required": False, "searchable": True},
        ],
    },
    "FURNITURE": {
        "label": "Furniture & Home Decor",
        "description": "Tables, chairs, sofas, beds, cabinets, mattresses",
        "default_tax_rate": 18.0,
        "default_unit": "PCS",
        "supported_units": ["PCS", "SET"],
        "attributes": [
            {"key": "wood_material", "label": "Wood / Material (Teak, Sheesham, Steel)", "type": "text", "required": False, "searchable": True},
            {"key": "dimensions", "label": "Dimensions (L x W x H)", "type": "text", "required": False, "searchable": False},
            {"key": "finish", "label": "Finish / Polish", "type": "text", "required": False, "searchable": False},
        ],
    },
    "ELECTRICAL": {
        "label": "Electrical Equipment",
        "description": "Wires, switches, lighting, circuit breakers, motors",
        "default_tax_rate": 18.0,
        "default_unit": "PCS",
        "supported_units": ["PCS", "MTR", "COIL", "BOX", "SET"],
        "attributes": [
            {"key": "brand", "label": "Brand", "type": "text", "required": False, "searchable": True},
            {"key": "wattage", "label": "Wattage / Voltage", "type": "text", "required": False, "searchable": True},
            {"key": "wire_gauge", "label": "Wire Gauge / Core (e.g. 2.5 sq mm)", "type": "text", "required": False, "searchable": True},
        ],
    },
    "MOBILE_COMPUTER": {
        "label": "Mobile & Computer Shop",
        "description": "Smartphones, laptops, accessories, computer peripherals, repair parts",
        "default_tax_rate": 18.0,
        "default_unit": "PCS",
        "supported_units": ["PCS", "BOX", "SET"],
        "attributes": [
            {"key": "brand", "label": "Brand", "type": "text", "required": True, "searchable": True},
            {"key": "ram_storage", "label": "RAM / Storage (e.g. 8GB / 256GB)", "type": "text", "required": False, "searchable": True},
            {"key": "imei_serial", "label": "IMEI / Serial Number", "type": "text", "required": False, "searchable": True},
            {"key": "warranty_months", "label": "Warranty Period (Months)", "type": "number", "required": False, "searchable": False},
        ],
    },
    "GENERAL": {
        "label": "General Store",
        "description": "Multi-category neighborhood general store",
        "default_tax_rate": 18.0,
        "default_unit": "PCS",
        "supported_units": ["PCS", "PKT", "BOX", "KG", "LTR"],
        "attributes": [
            {"key": "brand", "label": "Brand", "type": "text", "required": False, "searchable": True},
        ],
    },
    "OTHER": {
        "label": "Other Configurable Business",
        "description": "Custom business configuration",
        "default_tax_rate": 18.0,
        "default_unit": "PCS",
        "supported_units": ["PCS", "PKT", "BOX", "KG", "MTR", "LTR", "SET"],
        "attributes": [],
    },
}


def get_business_type_info(business_type: str) -> dict:
    bt = (business_type or "RETAIL").upper()
    return BUSINESS_TYPE_DEFINITIONS.get(bt, BUSINESS_TYPE_DEFINITIONS["RETAIL"])


# Universal mapping supporting both lower and upper case keys
BUSINESS_TYPES = {}
for k, v in BUSINESS_TYPE_DEFINITIONS.items():
    entry = {**v, "custom_fields": v.get("attributes", [])}
    BUSINESS_TYPES[k] = entry
    BUSINESS_TYPES[k.lower()] = entry

