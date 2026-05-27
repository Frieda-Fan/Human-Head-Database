import sys
import os
import numpy as np
import open3d as o3d


def create_line_geometry(points, color):
    lines = []
    for i in range(len(points)-1):
        lines.append([i, i+1])
    line_set = o3d.geometry.LineSet()
    line_set.points = o3d.utility.Vector3dVector(points)
    line_set.lines = o3d.utility.Vector2iVector(lines)
    line_set.colors = o3d.utility.Vector3dVector([color for _ in lines])
    return line_set


def visualize_head_measurements(mesh_path):
    mesh = o3d.io.read_triangle_mesh(mesh_path)
    if not mesh.has_vertices():
        print("无法读取网格数据")
        return

    if not mesh.has_vertex_normals():
        mesh.compute_vertex_normals()

    vertices = np.asarray(mesh.vertices)
    bbox = mesh.get_axis_aligned_bounding_box()

    min_x, min_y, min_z = bbox.min_bound
    max_x, max_y, max_z = bbox.max_bound
    center = bbox.get_center()

    width = max_x - min_x
    height = max_y - min_y
    depth = max_z - min_z

    print(f"\n{'='*60}")
    print(f"模型: {os.path.basename(mesh_path)}")
    print('='*60)
    print(f"顶点数: {len(vertices):,}")
    print(f"\n尺寸:")
    print(f"  宽度 (X轴): {width:.2f} mm")
    print(f"  高度 (Y轴): {height:.2f} mm")
    print(f"  深度 (Z轴): {depth:.2f} mm")
    print("\n操作说明:")
    print("  - 鼠标左键拖动旋转")
    print("  - 鼠标右键拖动平移")
    print("  - 滚轮缩放")
    print("  - 按 ESC 退出")
    print(f"\n{'='*60}")

    print("\n颜色说明:")
    print("  红色 → 宽度 (X轴)")
    print("  绿色 → 高度 (Y轴)")
    print("  蓝色 → 深度 (Z轴)")
    print("  黄色 → 头围")

    geometries = []
    mesh.paint_uniform_color([0.7, 0.7, 0.7])
    geometries.append(mesh)

    width_points = [
        [min_x, center[1], center[2]],
        [max_x, center[1], center[2]]
    ]
    width_line = create_line_geometry(width_points, [1, 0, 0])
    geometries.append(width_line)

    height_points = [
        [center[0], min_y, center[2]],
        [center[0], max_y, center[2]]
    ]
    height_line = create_line_geometry(height_points, [0, 1, 0])
    geometries.append(height_line)

    depth_points = [
        [center[0], center[1], min_z],
        [center[0], center[1], max_z]
    ]
    depth_line = create_line_geometry(depth_points, [0, 0, 1])
    geometries.append(depth_line)

    sphere_size = min(width, height, depth) * 0.01

    width_sphere1 = o3d.geometry.TriangleMesh.create_sphere(sphere_size)
    width_sphere1.translate(width_points[0])
    width_sphere1.paint_uniform_color([1, 0, 0])
    geometries.append(width_sphere1)

    width_sphere2 = o3d.geometry.TriangleMesh.create_sphere(sphere_size)
    width_sphere2.translate(width_points[1])
    width_sphere2.paint_uniform_color([1, 0, 0])
    geometries.append(width_sphere2)

    height_sphere1 = o3d.geometry.TriangleMesh.create_sphere(sphere_size)
    height_sphere1.translate(height_points[0])
    height_sphere1.paint_uniform_color([0, 1, 0])
    geometries.append(height_sphere1)

    height_sphere2 = o3d.geometry.TriangleMesh.create_sphere(sphere_size)
    height_sphere2.translate(height_points[1])
    height_sphere2.paint_uniform_color([0, 1, 0])
    geometries.append(height_sphere2)

    depth_sphere1 = o3d.geometry.TriangleMesh.create_sphere(sphere_size)
    depth_sphere1.translate(depth_points[0])
    depth_sphere1.paint_uniform_color([0, 0, 1])
    geometries.append(depth_sphere1)

    depth_sphere2 = o3d.geometry.TriangleMesh.create_sphere(sphere_size)
    depth_sphere2.translate(depth_points[1])
    depth_sphere2.paint_uniform_color([0, 0, 1])
    geometries.append(depth_sphere2)

    head_middle_y = (min_y + max_y) * 0.5
    tolerance = height * 0.15

    mid_vertices = vertices[
        (vertices[:, 1] >= head_middle_y - tolerance) &
        (vertices[:, 1] <= head_middle_y + tolerance)
    ]

    if len(mid_vertices) > 10:
        mid_point_cloud = o3d.geometry.PointCloud()
        mid_point_cloud.points = o3d.utility.Vector3dVector(mid_vertices)
        mid_point_cloud.paint_uniform_color([1, 1, 0])
        geometries.append(mid_point_cloud)

        from scipy.spatial import ConvexHull
        points_2d = mid_vertices[:, [0, 2]]
        try:
            hull = ConvexHull(points_2d)
            hull_vertices = mid_vertices[hull.vertices]
            hull_points_3d = []
            for hv in hull_vertices:
                hull_points_3d.append([hv[0], head_middle_y, hv[2]])
            hull_points_3d.append(hull_points_3d[0])

            hull_line = create_line_geometry(hull_points_3d, [1, 1, 0])
            geometries.append(hull_line)

            circumference = 0
            for i in range(len(hull_vertices)):
                p1 = hull_vertices[i]
                p2 = hull_vertices[(i + 1) % len(hull_vertices)]
                circumference += np.linalg.norm(p1 - p2)
            print(f"\n估计头围: {circumference:.2f} mm")
        except Exception as e:
            print(f"头围计算: {e}")

    coord_frame = o3d.geometry.TriangleMesh.create_coordinate_frame(
        size=min(width, height, depth) * 0.3,
        origin=center
    )
    geometries.append(coord_frame)

    o3d.visualization.draw_geometries(
        geometries,
        window_name=f"头模测量可视化 - {os.path.basename(mesh_path)}",
        width=1200,
        height=800,
        left=50,
        top=50
    )


if __name__ == "__main__":
    models_dir = os.path.join(os.path.dirname(__file__), '..', 'models')
    obj_files = [f for f in os.listdir(models_dir) if f.lower().endswith('.obj')]

    if not obj_files:
        print("未找到 .obj 文件")
        sys.exit(1)

    print("选择要可视化的文件:")
    for i, f in enumerate(obj_files, 1):
        print(f"  {i}. {f}")

    print("\n默认分析第一个文件...")
    selected_path = os.path.join(models_dir, obj_files[0])
    visualize_head_measurements(selected_path)
