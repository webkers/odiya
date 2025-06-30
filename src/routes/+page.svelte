<script>
	import { Button } from "$lib/components/ui/button";
	import { goto } from '$app/navigation';
	import { generateRoomId } from '$lib/utils.js';

	function createRoom() {
		const roomId = generateRoomId();
		
		// Mark user as creator of this room
		localStorage.setItem(`room_${roomId}_creator`, 'true');
		
		// Navigate to the new room
		goto(`/room/${roomId}`);
	}
</script>

<main class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 px-4">
	<div class="max-w-2xl text-center space-y-8">
		<!-- Logo/Title -->
		<div class="space-y-4">
			<h1 class="text-4xl md:text-6xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
				오디야
			</h1>
			<p class="text-lg md:text-xl text-slate-600 dark:text-slate-400 font-medium">
				로그인 없는 안전한 일회용 위치공유 웹
			</p>
		</div>

		<!-- Description -->
		<div class="space-y-4 text-slate-600 dark:text-slate-400">
			<p class="text-base md:text-lg">
				간편하게 룸을 만들고 링크를 공유하여<br>
				실시간으로 위치를 공유하고 소통하세요
			</p>
			<div class="flex flex-wrap justify-center gap-2 text-sm">
				<span class="bg-slate-200 dark:bg-slate-700 px-3 py-1 rounded-full">회원가입 불필요</span>
				<span class="bg-slate-200 dark:bg-slate-700 px-3 py-1 rounded-full">일회용 룸</span>
				<span class="bg-slate-200 dark:bg-slate-700 px-3 py-1 rounded-full">실시간 위치공유</span>
			</div>
		</div>

		<!-- Main CTA Button -->
		<div class="space-y-4">
			<Button 
				size="lg" 
				class="text-lg px-8 py-4 h-auto bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900"
				disabled={false}
				onclick={createRoom}
			>
				룸 만들기
			</Button>
			<p class="text-sm text-slate-500 dark:text-slate-500">
				룸을 만들면 공유 가능한 링크가 생성됩니다
			</p>
		</div>
	</div>
</main>
