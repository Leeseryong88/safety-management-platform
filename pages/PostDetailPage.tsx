import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, Timestamp, where } from 'firebase/firestore';
import { BoardPost, BoardComment } from '../types';
import { useAuth } from '../components/Layout';
import Spinner from '../components/Spinner';
import { ChatBubbleLeftRightIcon, PencilIcon, TrashIcon, UserCircleIcon, DocumentTextIcon } from '../components/Icons';
import DOMPurify from 'dompurify';

const PostDetailPage: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [post, setPost] = useState<BoardPost | null>(null);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [newComment, setNewComment] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmittingComment, setIsSubmittingComment] = useState<boolean>(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // 게시물 불러오기
  const fetchPost = async () => {
    if (!postId) return;
    
    try {
      const postDoc = await getDoc(doc(db, "boardPosts", postId));
      if (postDoc.exists()) {
        setPost({ id: postDoc.id, ...postDoc.data() } as BoardPost);
      } else {
        setError("게시물을 찾을 수 없습니다.");
      }
    } catch (err: any) {
      console.error("Error fetching post:", err);
      setError("게시물을 불러오는데 실패했습니다.");
    }
  };

  // 댓글 불러오기
  const fetchComments = async () => {
    if (!postId) return;
    
    try {
      const q = query(
        collection(db, "boardComments"), 
        where("postId", "==", postId), 
        orderBy("createdAt", "asc")
      );
      const querySnapshot = await getDocs(q);
      const fetchedComments: BoardComment[] = [];
      querySnapshot.forEach((doc) => {
        fetchedComments.push({ id: doc.id, ...doc.data() } as BoardComment);
      });
      setComments(fetchedComments);
    } catch (err: any) {
      console.error("Error fetching comments:", err);
    }
  };

  // 댓글 작성
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser || !postId) return;

    setIsSubmittingComment(true);
    try {
      const commentData = {
        postId: postId,
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email || '익명',
        content: newComment.trim(),
        createdAt: serverTimestamp() as Timestamp,
      };

      await addDoc(collection(db, "boardComments"), commentData);
      setNewComment('');
      await fetchComments();
    } catch (err: any) {
      console.error("Error adding comment:", err);
      setError("댓글 작성에 실패했습니다.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // 댓글 수정 시작
  const startEditComment = (comment: BoardComment) => {
    setEditingCommentId(comment.id || null);
    setEditingCommentContent(comment.content);
  };

  // 댓글 수정 취소
  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentContent('');
  };

  // 댓글 수정 저장
  const saveEditComment = async (commentId: string) => {
    if (!editingCommentContent.trim()) return;

    setIsSubmittingComment(true);
    try {
      await updateDoc(doc(db, "boardComments", commentId), {
        content: editingCommentContent.trim(),
        updatedAt: serverTimestamp() as Timestamp,
      });
      
      setEditingCommentId(null);
      setEditingCommentContent('');
      await fetchComments();
    } catch (err: any) {
      console.error("Error updating comment:", err);
      setError("댓글 수정에 실패했습니다.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // 댓글 삭제
  const deleteComment = async (commentId: string) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, "boardComments", commentId));
      await fetchComments();
    } catch (err: any) {
      console.error("Error deleting comment:", err);
      setError("댓글 삭제에 실패했습니다.");
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchPost(), fetchComments()]);
      setIsLoading(false);
    };
    
    loadData();
  }, [postId]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex justify-center items-center h-64">
          <Spinner text="게시물 로딩 중..." />
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="container mx-auto p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">{error || "게시물을 찾을 수 없습니다."}</p>
          <button 
            onClick={() => navigate(-1)}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            뒤로 가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      {/* 헤더 */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
        >
          <DocumentTextIcon className="w-5 h-5 mr-2" />
          목록으로 돌아가기
        </button>
      </div>

      {/* 게시물 내용 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="border-b pb-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">{post.title}</h1>
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center">
              <UserCircleIcon className="w-5 h-5 mr-2" />
              <span className="font-medium">{post.userName || '익명'}</span>
            </div>
            <div className="flex items-center space-x-4">
              <span>
                {post.createdAt?.toDate().toLocaleDateString()} {post.createdAt?.toDate().toLocaleTimeString()}
              </span>
              {post.updatedAt && (
                <span className="text-blue-600">(수정됨: {post.updatedAt.toDate().toLocaleDateString()})</span>
              )}
            </div>
          </div>
        </div>

        {/* 게시물 본문 */}
        <div className="prose max-w-none ql-snow">
          <div 
            className="ql-editor"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content || '') }} 
          />
        </div>
      </div>

      {/* 댓글 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center mb-6">
          <ChatBubbleLeftRightIcon className="w-6 h-6 text-gray-500 mr-3" />
          <h2 className="text-xl font-semibold text-gray-800">댓글 ({comments.length})</h2>
        </div>

        {/* 댓글 작성 폼 */}
        {currentUser ? (
          <form onSubmit={handleSubmitComment} className="mb-8">
            <div className="flex items-center space-x-3">
              <UserCircleIcon className="w-8 h-8 text-gray-400" />
              <div className="flex-grow">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  placeholder="댓글을 작성하세요..."
                  disabled={isSubmittingComment}
                />
              </div>
              <button
                type="submit"
                disabled={isSubmittingComment || !newComment.trim()}
                className="px-6 py-3 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:bg-gray-400 transition-colors"
              >
                {isSubmittingComment ? <Spinner size="sm" /> : '작성'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mb-8 p-4 bg-gray-50 rounded-lg text-center">
            <p className="text-gray-600 mb-3">댓글을 작성하려면 로그인이 필요합니다.</p>
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              로그인하러 가기
            </button>
          </div>
        )}

        {/* 댓글 목록 */}
        <div className="space-y-4">
          {comments.length === 0 ? (
            <p className="text-gray-500 text-center py-8">첫 번째 댓글을 작성해보세요!</p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="border-b border-gray-100 pb-4 last:border-b-0">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    <UserCircleIcon className="w-5 h-5 text-gray-400 mr-2" />
                    <span className="font-medium text-gray-700">{comment.userName || '익명'}</span>
                    <span className="text-sm text-gray-500 ml-3">
                      {comment.createdAt?.toDate().toLocaleDateString()} {comment.createdAt?.toDate().toLocaleTimeString()}
                      {comment.updatedAt && ' (수정됨)'}
                    </span>
                  </div>
                  
                  {/* 댓글 수정/삭제 버튼 */}
                  {currentUser && currentUser.uid === comment.userId && (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => startEditComment(comment)}
                        className="text-yellow-600 hover:text-yellow-800 p-1"
                        title="댓글 수정"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => comment.id && deleteComment(comment.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="댓글 삭제"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                
                {/* 댓글 내용 또는 수정 폼 */}
                {editingCommentId === comment.id ? (
                  <div className="ml-7">
                    <div className="flex items-center space-x-3">
                      <input
                        type="text"
                        value={editingCommentContent}
                        onChange={(e) => setEditingCommentContent(e.target.value)}
                        className="flex-grow px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        placeholder="댓글을 수정하세요..."
                      />
                      <button
                        onClick={cancelEditComment}
                        className="px-3 py-2 text-sm text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300"
                      >
                        취소
                      </button>
                      <button
                        onClick={() => comment.id && saveEditComment(comment.id)}
                        disabled={isSubmittingComment || !editingCommentContent.trim()}
                        className="px-3 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:bg-gray-400"
                      >
                        {isSubmittingComment ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-700 ml-7 whitespace-pre-wrap break-words">{comment.content}</p>
                )}
              </div>
            ))
          )}
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}
      </div>

      <style>{`
        .ql-snow .ql-editor img {
          max-width: 100%;
          height: auto;
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
          display: block; 
          margin-left: auto;
          margin-right: auto;
          border-radius: 0.25rem; 
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06); 
        }
        .ql-snow .ql-editor video {
          display: block;
          max-width: 100%;
          margin: 1rem auto;
        }
        .ql-editor { 
          font-size: 1rem;
          line-height: 1.6;
          padding: 0;
        }
        .prose.ql-snow .ql-editor p,
        .prose.ql-snow .ql-editor ul,
        .prose.ql-snow .ql-editor ol,
        .prose.ql-snow .ql-editor h1,
        .prose.ql-snow .ql-editor h2,
        .prose.ql-snow .ql-editor h3 {
            margin-bottom: 1em;
            margin-top: 1em;
        }
        .prose.ql-snow .ql-editor a {
             color: #3b82f6; 
             text-decoration: underline;
        }
      `}</style>
    </div>
  );
};

export default PostDetailPage; 