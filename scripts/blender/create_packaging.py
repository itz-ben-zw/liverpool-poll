"""
QuickCart Blender packaging exporter
Run inside Blender's Scripting workspace. Exports one GLB per seeded product.
Output: public/models/product-1.glb ... product-6.glb
"""
import bpy
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath), ".."))
OUT = os.path.join(ROOT, "public", "models")
os.makedirs(OUT, exist_ok=True)

PRODUCTS = [
    (1, "Wireless Headphones", "Work & tech", (0.035, 0.19, 0.16, 1), (0.78, 0.66, 0.39, 1)),
    (2, "Classic Backpack", "Everyday carry", (0.16, 0.25, 0.34, 1), (0.88, 0.72, 0.46, 1)),
    (3, "Smart Watch", "Work & tech", (0.035, 0.19, 0.16, 1), (0.78, 0.66, 0.39, 1)),
    (4, "Running Shoes", "Everyday carry", (0.16, 0.25, 0.34, 1), (0.88, 0.72, 0.46, 1)),
    (5, "Desk Lamp", "Home & living", (0.42, 0.20, 0.13, 1), (0.91, 0.78, 0.59, 1)),
    (6, "Travel Bottle", "Everyday carry", (0.16, 0.25, 0.34, 1), (0.88, 0.72, 0.46, 1)),
]

def material(name, color, metallic=0.0, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat

def cube(name, location, scale, mat, bevel=0.045):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Soft packaging edges", "BEVEL")
        mod.width = bevel
        mod.segments = 4
        obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def text_mesh(body, location, size, mat):
    curve = bpy.data.curves.new("Printed label", "FONT")
    curve.body = body
    curve.size = size
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.extrude = 0.0008
    obj = bpy.data.objects.new(body, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler[0] = 1.5708
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.object

def export_product(product_id, name, category, base_color, accent_color):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    base = material("QuickCart | enamel", base_color, 0.08, 0.34)
    accent = material("QuickCart | foil", accent_color, 0.35, 0.3)
    ink = material("QuickCart | print", (0.97, 0.95, 0.87, 1), 0, 0.55)

    # A folded-carton silhouette with a separate top seal and printed front panel.
    body = cube(name + " | carton", (0, 0, 0), (1.72, 2.35, 0.82), base, 0.075)
    body["brand"] = "QuickCart Select"
    body["category"] = category
    cube("Foil top seal", (0, 1.19, 0), (1.72, 0.12, 0.84), accent, 0.035)
    cube("Front label panel", (0, 0, 0.414), (1.54, 2.12, 0.018), base, 0.025)
    text_mesh("QUICKCART / SELECT", (0, 0.79, 0.431), 0.115, ink)
    text_mesh("THE EVERYDAY", (0, 0.38, 0.431), 0.19, accent)
    text_mesh("EDIT", (0, 0.12, 0.431), 0.22, accent)
    words = name.split()
    if len(words) > 2:
        text_mesh(" ".join(words[:2]), (0, -0.32, 0.431), 0.2, ink)
        text_mesh(" ".join(words[2:]), (0, -0.58, 0.431), 0.2, ink)
    else:
        text_mesh(name, (0, -0.43, 0.431), 0.2, ink)
    text_mesh(category.upper(), (0, -0.91, 0.431), 0.09, ink)

    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = body
    path = os.path.join(OUT, f"product-{product_id}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB",
                               use_selection=True, export_apply=True)
    print("Exported", path)

for item in PRODUCTS:
    export_product(*item)

print("QuickCart GLB packaging export complete.")
