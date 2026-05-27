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


def align_mesh_by_pca(mesh):
    vertices = np.asarray(mesh.vertices)
    center = np.mean(vertices, axis=0)
    vertices_centered = vertices - center

    cov_matrix = np.cov(vertices_centered.T)
    eigenvalues, eigenvectors = np.linalg.eig(cov_matrix)
    sorted_indices = np.argsort(eigenvalues)[::-1]
    eigenvectors = eigenvectors[:, sorted_indices]

    if np.linalg.det(eigenvectors) < 0:
        eigenvectors[:, 2] = -eigenvectors[:, 2]

    R = eigenvectors
    vertices_aligned = vertices_centered @ R

    mesh.vertices = o3d.utility.Vector3dVector(vertices_aligned)
    return mesh


def calculate_head_circumference_improved(mesh):
    try:
        vertices = np.asarray(mesh.vertices)
        bbox = mesh.get_axis_aligned_bounding_box()
        height = bbox.max_bound[1] - bbox.min_bound[1]

        head_height = height * 0.5
        top_threshold = bbox.max_bound[1] - head_height
        bottom_threshold = bbox.max_bound[1] - head_height * 0.8

        head_vertices = vertices[
            (vertices[:, 1] >= bottom_threshold) &
            (vertices[:, 1] <= top_threshold)
        ]

        if len(head_vertices) < 50:
            return None

        points_2d = head_vertices[:, [0, 2]]
        hull = ConvexHull(points_2d)
        hull_vertices = points_2d[hull.vertices]

        circumference = 0.0
        n = len(hull_vertices)
        for i in range(n):
            p1 = hull_vertices[i]
            p2 = hull_vertices[(i + 1) % n]
            circumference += np.linalg.norm(p1 - p2)

        return circumference
    except Exception as e:
        print(f"头围计算错误: {e}")
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

        vertices = np.asarray(mesh.vertices)
        triangles = np.asarray(mesh.triangles)

        print("\n【原始模型信息】")
        print(f"  顶点数量: {len(vertices):,}")
        print(f"  三角形面数: {len(triangles):,}")

        if not mesh.has_vertex_normals():
            mesh.compute_vertex_normals()

        bbox = mesh.get_axis_aligned_bounding_box()
        width = bbox.max_bound[0] - bbox.min_bound[0]
        height = bbox.max_bound[1] - bbox.min_bound[1]
        depth = bbox.max_bound[2] - bbox.min_bound[2]

        print("\n【原始尺寸】")
        print(f"  X轴范围: {bbox.min_bound[0]:.4f} ~ {bbox.max_bound[0]:.4f} (宽度: {width:.4f})")
        print(f"  Y轴范围: {bbox.min_bound[1]:.4f} ~ {bbox.max_bound[1]:.4f} (高度: {height:.4f})")
        print(f"  Z轴范围: {bbox.min_bound[2]:.4f} ~ {bbox.max_bound[2]:.4f} (深度: {depth:.4f})")

        print("\n【坐标对齐中...】")
        mesh_aligned = align_mesh_by_pca(mesh)
        bbox_aligned = mesh_aligned.get_axis_aligned_bounding_box()
        width_aligned = bbox_aligned.max_bound[0] - bbox_aligned.min_bound[0]
        height_aligned = bbox_aligned.max_bound[1] - bbox_aligned.min_bound[1]
        depth_aligned = bbox_aligned.max_bound[2] - bbox_aligned.min_bound[2]

        print("\n【对齐后尺寸】")
        print(f"  X轴范围: {bbox_aligned.min_bound[0]:.4f} ~ {bbox_aligned.max_bound[0]:.4f} (宽度: {width_aligned:.4f})")
        print(f"  Y轴范围: {bbox_aligned.min_bound[1]:.4f} ~ {bbox_aligned.max_bound[1]:.4f} (高度: {height_aligned:.4f})")
        print(f"  Z轴范围: {bbox_aligned.min_bound[2]:.4f} ~ {bbox_aligned.max_bound[2]:.4f} (深度: {depth_aligned:.4f})")

        print("\n【几何属性】")
        surface_area = mesh_aligned.get_surface_area()
        print(f"  表面积: {surface_area:.4f}")

        head_circumference = calculate_head_circumference_improved(mesh_aligned)
        if head_circumference:
            print(f"  头围: {head_circumference:.4f}")
        else:
            print("  头围: 计算失败")

        result = {
            'filename': os.path.basename(mesh_path),
            'vertices': len(vertices),
            'triangles': len(triangles),
            'width': width_aligned,
            'height': height_aligned,
            'depth': depth_aligned,
            'head_circumference': head_circumference if head_circumference else 0,
            'surface_area': surface_area
        }

        return result

    except Exception as e:
        print(f"错误: {e}")
        import traceback
        traceback.print_exc()
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
            print("分析汇总 (对齐后)")
            print("="*80)
            print(f"{'文件名':<20} {'宽度':>10} {'高度':>10} {'深度':>10} {'头围':>10}")
            print(f"{'':>20} {'mm':>10} {'mm':>10} {'mm':>10} {'mm':>10}")
            print("-"*80)
            for r in all_results:
                print(f"{r['filename']:<20} {r['width']:>10.4f} {r['height']:>10.4f} {r['depth']:>10.4f} {r['head_circumference']:>10.4f}")
