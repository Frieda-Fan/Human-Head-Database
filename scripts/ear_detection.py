import numpy as np
import open3d as o3d
from sklearn.cluster import DBSCAN
import argparse

def compute_surface_variation(mesh, k_neighbors=20):
    """计算每个顶点的表面变化率（曲率指标）"""
    mesh.compute_vertex_normals()
    vertices = np.asarray(mesh.vertices)
    normals = np.asarray(mesh.vertex_normals)
    
    # 构建邻接关系
    edges = mesh.adjacency_list()
    
    surface_variation = np.zeros(len(vertices))
    
    for i in range(len(vertices)):
        neighbors = edges[i]
        if len(neighbors) < 3:
            surface_variation[i] = 0
            continue
            
        # 获取邻域点
        neighbor_points = vertices[neighbors]
        mean_pos = np.mean(neighbor_points, axis=0)
        
        # 计算协方差矩阵
        centered = neighbor_points - mean_pos
        cov_matrix = np.cov(centered.T)
        
        # 求特征值
        eigenvalues = np.linalg.eigvalsh(cov_matrix)
        eigenvalues = np.sort(eigenvalues)
        
        # surface_variation = λ0 / (λ0 + λ1 + λ2)
        total = eigenvalues.sum()
        if total > 0:
            surface_variation[i] = eigenvalues[0] / total
        else:
            surface_variation[i] = 0
    
    return surface_variation

def detect_ear_regions(mesh, Tcurvature=0.015, Tside_ratio=0.06):
    """检测耳朵候选区域"""
    vertices = np.asarray(mesh.vertices)
    
    # 计算头部宽度
    head_width = np.max(vertices[:, 2]) - np.min(vertices[:, 2])
    Tside = Tside_ratio * head_width
    
    # 计算表面变化率
    surface_variation = compute_surface_variation(mesh)
    
    # 检测耳朵候选点
    # 条件：高曲率 且 位于头部两侧
    ear_candidates = np.where(
        (surface_variation > Tcurvature) & 
        (np.abs(vertices[:, 2]) > Tside)
    )[0]
    
    return ear_candidates, surface_variation, vertices

def cluster_ears(vertices, ear_candidates, eps=0.01, min_points=30):
    """使用DBSCAN聚类耳朵区域"""
    candidate_points = vertices[ear_candidates]
    
    if len(candidate_points) < min_points:
        return None, None
    
    # DBSCAN聚类
    dbscan = DBSCAN(eps=eps, min_samples=min_points)
    labels = dbscan.fit_predict(candidate_points)
    
    # 找到左右两侧最大的cluster
    unique_labels = np.unique(labels[labels >= 0])
    
    if len(unique_labels) < 2:
        return None, None
    
    # 按大小排序
    cluster_sizes = []
    for label in unique_labels:
        mask = labels == label
        cluster_points = candidate_points[mask]
        cluster_sizes.append((label, len(cluster_points), cluster_points))
    
    cluster_sizes.sort(key=lambda x: -x[1])
    
    # 选择前两个最大的cluster，按Z坐标判断左右
    cluster1, cluster2 = cluster_sizes[0][2], cluster_sizes[1][2]
    cluster1_z_mean = np.mean(cluster1[:, 2])
    cluster2_z_mean = np.mean(cluster2[:, 2])
    
    if cluster1_z_mean > cluster2_z_mean:
        right_ear_points = cluster1
        left_ear_points = cluster2
    else:
        right_ear_points = cluster2
        left_ear_points = cluster1
    
    return left_ear_points, right_ear_points

def compute_concavity(mesh, vertex_indices):
    """计算凹陷度"""
    mesh.compute_vertex_normals()
    vertices = np.asarray(mesh.vertices)
    normals = np.asarray(mesh.vertex_normals)
    edges = mesh.adjacency_list()
    
    concavity = []
    
    for idx in vertex_indices:
        neighbors = edges[idx]
        if len(neighbors) < 3:
            concavity.append(0)
            continue
        
        # 计算平均曲率近似
        ni = normals[idx]
        angle_sum = 0
        count = 0
        
        for j in neighbors:
            nj = normals[j]
            # 计算法线夹角
            dot = np.clip(np.dot(ni, nj), -1, 1)
            angle = np.arccos(dot)
            angle_sum += angle
            count += 1
        
        if count > 0:
            H = angle_sum / count
            concavity.append(max(0, -H))
        else:
            concavity.append(0)
    
    return np.array(concavity)

def compute_normal_diff(mesh, vertex_indices):
    """计算法线变化"""
    mesh.compute_vertex_normals()
    normals = np.asarray(mesh.vertex_normals)
    edges = mesh.adjacency_list()
    
    normal_diff = []
    
    for idx in vertex_indices:
        neighbors = edges[idx]
        if len(neighbors) < 3:
            normal_diff.append(0)
            continue
        
        ni = normals[idx]
        angle_sum = 0
        count = 0
        
        for j in neighbors:
            nj = normals[j]
            dot = np.clip(np.dot(ni, nj), -1, 1)
            angle = np.arccos(dot)
            angle_sum += angle
            count += 1
        
        if count > 0:
            normal_diff.append(angle_sum / count)
        else:
            normal_diff.append(0)
    
    return np.array(normal_diff)

def find_ear_root(mesh, ear_points, vertex_indices, is_left=True):
    """找到耳根点"""
    # 获取原始顶点索引
    vertices = np.asarray(mesh.vertices)
    
    # 计算凹陷度和法线变化
    concavity = compute_concavity(mesh, vertex_indices)
    normal_diff = compute_normal_diff(mesh, vertex_indices)
    
    # 耳朵中心
    ear_center_y = np.mean(ear_points[:, 1])
    
    # 评分
    X = ear_points[:, 0]  # +X 前
    Y = ear_points[:, 1]  # +Y 上
    
    # 归一化
    X_norm = (X - X.min()) / (X.max() - X.min() + 1e-8)
    Y_norm = (Y - Y.min()) / (Y.max() - Y.min() + 1e-8)
    concavity_norm = (concavity - concavity.min()) / (concavity.max() - concavity.min() + 1e-8)
    normal_diff_norm = (normal_diff - normal_diff.min()) / (normal_diff.max() - normal_diff.min() + 1e-8)
    
    # 评分函数
    score = (0.35 * X_norm + 
             0.15 * Y_norm + 
             0.35 * concavity_norm + 
             0.15 * normal_diff_norm)
    
    # 约束条件
    # 条件1：位于耳朵上半区域
    mask = Y > ear_center_y
    
    # 条件2：位于耳朵前侧（X最大）
    # 已经在评分中体现
    
    # 应用约束
    score[~mask] = -1
    
    # 找到最高分
    best_idx = np.argmax(score)
    best_point = ear_points[best_idx]
    
    return best_point

def detect_ear_roots(mesh_path):
    """检测耳根点主函数"""
    # 读取模型
    mesh = o3d.io.read_triangle_mesh(mesh_path)
    
    if not mesh.has_vertices():
        print("Error: 无法读取模型")
        return None, None
    
    # 预处理：Laplacian平滑
    mesh.filter_smooth_laplacian(number_of_iterations=5)
    
    # 检测耳朵候选区域
    ear_candidates, surface_variation, vertices = detect_ear_regions(mesh)
    
    if len(ear_candidates) == 0:
        print("Error: 未检测到耳朵候选点")
        return None, None
    
    # 聚类
    left_ear_points, right_ear_points = cluster_ears(vertices, ear_candidates)
    
    if left_ear_points is None or right_ear_points is None:
        print("Error: 耳朵聚类失败")
        return None, None
    
    # 获取候选点的原始索引
    # 创建点到索引的映射
    point_to_idx = {tuple(p): i for i, p in enumerate(vertices)}
    
    left_indices = [point_to_idx.get(tuple(p), -1) for p in left_ear_points]
    left_indices = [i for i in left_indices if i != -1]
    
    right_indices = [point_to_idx.get(tuple(p), -1) for p in right_ear_points]
    right_indices = [i for i in right_indices if i != -1]
    
    # 找到耳根点
    left_ear_root = find_ear_root(mesh, left_ear_points, left_indices, is_left=True)
    right_ear_root = find_ear_root(mesh, right_ear_points, right_indices, is_left=False)
    
    return left_ear_root, right_ear_root

def main():
    parser = argparse.ArgumentParser(description='检测耳根点')
    parser.add_argument('mesh_path', type=str, help='OBJ模型路径')
    args = parser.parse_args()
    
    left_root, right_root = detect_ear_roots(args.mesh_path)
    
    if left_root is not None and right_root is not None:
        print(f"左耳根点: {left_root[0]:.4f} {left_root[1]:.4f} {left_root[2]:.4f}")
        print(f"右耳根点: {right_root[0]:.4f} {right_root[1]:.4f} {right_root[2]:.4f}")
    else:
        print("检测失败")

if __name__ == '__main__':
    main()
