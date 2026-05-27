import sys
import os
import numpy as np
from scipy.spatial import ConvexHull

try:
    import open3d as o3d
except ImportError:
    print("错误: 未安装 open3d 库")
    print("请运行: pip install open3d")
    sys.exit(1)


def calculate_head_circumference(mesh, num_samples=500):
    try:
        bbox = mesh.get_axis_aligned_bounding_box()

        head_middle_height = (bbox.min_bound[1] + bbox.max_bound[1]) / 2

        vertices = np.asarray(mesh.vertices)
        height_tolerance = (bbox.get_extent()[1]) * 0.15

        middle_vertices = vertices[
            (vertices[:, 1] >= head_middle_height - height_tolerance) &
            (vertices[:, 1] <= head_middle_height + height_tolerance)
        ]

        if len(middle_vertices) < 10:
            return None

        points_2d = middle_vertices[:, [0, 2]]

        if len(points_2d) > num_samples:
            indices = np.random.choice(len(points_2d), num_samples, replace=False)
            points_2d = points_2d[indices]

        try:
            hull = ConvexHull(points_2d)
            hull_points = points_2d[hull.simplices]
            circumference = sum(np.linalg.norm(hull_points[i] - hull_points[(i+1) % len(hull_points)]) for i in range(len(hull_points)))
            return circumference
        except Exception:
            return None

    except Exception:
        return None


def analyze_mesh(mesh_path):
    print(f"\n{'='*60}")
    print(f"开始分析: {os.path.basename(mesh_path)}")
    print('='*60)

    try:
        mesh = o3d.io.read_triangle_mesh(mesh_path)
        if not mesh.has_vertices():
            print("错误: 无法读取网格数据")
            print("提示: 该文件可能包含非三角形几何体（如四边形）")
            print("建议: 使用 Rhino、Blender 等软件将模型转换为纯三角形网格")
            return None

        print(f"\n【基础几何信息】")
        print(f"  顶点数量: {len(mesh.vertices)}")
        print(f"  三角形面数: {len(mesh.triangles)}")

        if mesh.has_vertex_normals():
            print(f"  顶点法向量: [OK]")
        else:
            mesh.compute_vertex_normals()
            print(f"  顶点法向量: 已计算")

        bbox = mesh.get_axis_aligned_bounding_box()
        print(f"\n【边界框信息】")
        print(f"  X轴范围: {bbox.min_bound[0]:.4f} ~ {bbox.max_bound[0]:.4f} (宽度: {bbox.get_extent()[0]:.4f})")
        print(f"  Y轴范围: {bbox.min_bound[1]:.4f} ~ {bbox.max_bound[1]:.4f} (高度: {bbox.get_extent()[1]:.4f})")
        print(f"  Z轴范围: {bbox.min_bound[2]:.4f} ~ {bbox.max_bound[2]:.4f} (深度: {bbox.get_extent()[2]:.4f})")

        print(f"\n【几何属性】")
        print(f"  表面积: {mesh.get_surface_area():.4f}")

        circumference = calculate_head_circumference(mesh)
        if circumference:
            print(f"  头围估计: {circumference:.4f}")
        else:
            print(f"  头围估计: 无法计算")

        print(f"\n【材质信息】")
        print(f"  材质: [信息不可用]")

        print(f"\n{'='*60}")
        print("分析完成!")
        print('='*60)

        return {
            'filename': os.path.basename(mesh_path),
            'vertices': len(mesh.vertices),
            'triangles': len(mesh.triangles),
            'width': bbox.get_extent()[0],
            'height': bbox.get_extent()[1],
            'depth': bbox.get_extent()[2],
            'surface_area': mesh.get_surface_area(),
            'head_circumference': circumference if circumference else 0
        }

    except Exception as e:
        print(f"分析出错: {str(e)}")
        return None


if __name__ == "__main__":
    models_dir = os.path.join(os.path.dirname(__file__), '..', 'models')
    obj_files = [f for f in os.listdir(models_dir) if f.lower().endswith('.obj')]

    if not obj_files:
        print("在 models 文件夹中未找到 .obj 文件")
        print("请将头模文件放入 models 文件夹后重试")
    else:
        print(f"找到 {len(obj_files)} 个 OBJ 文件:")
        for i, f in enumerate(obj_files, 1):
            print(f"  {i}. {f}")
        print()

        all_results = []
        for obj_file in obj_files:
            obj_path = os.path.join(models_dir, obj_file)
            result = analyze_mesh(obj_path)
            if result:
                all_results.append(result)

        if all_results:
            print("\n" + "="*80)
            print("分析汇总")
            print("="*80)
            print(f"{'文件名':<20} {'宽度':>10} {'高度':>10} {'深度':>10} {'头围':>10}")
            print(f"{'':>20} {'mm':>10} {'mm':>10} {'mm':>10} {'mm':>10}")
            print("-"*80)
            for r in all_results:
                print(f"{r['filename']:<20} {r['width']:>10.4f} {r['height']:>10.4f} {r['depth']:>10.4f} {r['head_circumference']:>10.4f}")