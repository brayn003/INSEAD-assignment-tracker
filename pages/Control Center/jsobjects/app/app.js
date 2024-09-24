export default {
	MAX_DUE_IN: 999999999,
	loadingData: false,
	sections: ["section_a1", "section_a2"],
	list_courses: {
		section_a1: list_courses_a1,
		section_a2: list_courses_a2,
	},
	list_assignments: {
		section_a1: list_assignments_a1,
		section_a2: list_assignments_a2,
	},
	excludedCourseIds: [
		8055, // Business Foundations
	],
	rawAssignments: {},
	courses: {},
	assignments: [],
	displayedAssignments: [],
	async fetchCourses () {
		const promises = this.sections.map((section) => {
			return this.list_courses[section].run();
		});
		const unflattenedCourses = await Promise.all(promises);
		this.sections.map((section, index) => {
			return this.courses[section] = unflattenedCourses[index];
		});
	},
	async filterCourses () {
		this.sections.forEach((section) => {
			this.courses[section] = this.courses[section].filter(c => !this.excludedCourseIds.includes(c.id))
		});
	},
	async fetchAssignments () {
		const allPromises = this.sections.map(async (section) => {
			const courses = this.courses[section];
			const promises = courses.map((course) => {
				return this.list_assignments[section].run({ courseId: course.id });
			});
			const unflattenedAssignments = await Promise.all(promises);
			const allAssignments = unflattenedAssignments.reduce((agg, assignments) => {
				return agg.concat(assignments);
			}, []);
			this.rawAssignments[section] = allAssignments;
		});
		await Promise.all(allPromises);
	},
	debugAssignmentDiffs() {
		const diff = _.reduce(this.rawAssignments.section_a1, function(result, value, key) {
			return _.isEqual(value, this.rawAssignments.section_a2[key]) ?
				result : [...result, [key, `${value.name}-${value.due_at}`, `${this.rawAssignments.section_a2[key].name}-${this.rawAssignments.section_a2[key].due_at}`]];
		}, []);
		console.log(diff)
	},
	unifyAllAssignments () {
		const assignmentIdentifiers = this.sections.reduce((agg, section) => {
			agg[section] = this.rawAssignments[section].map(a => `${a.id}~~${a.due_at}`);
			return agg;
		}, {});
		const mutualIdentifiers = _.intersection(...Object.values(assignmentIdentifiers));
		const mutualIds = mutualIdentifiers.map(m => parseInt(m.split("~~")[0], 10));
		const assignments = [];
		this.sections.forEach((section) => {
			this.rawAssignments[section].forEach((rawAssignment) => {
				const exists = assignments.findIndex(a => `${a.id}-${a.due_at}` === `${rawAssignment.id}-${rawAssignment.due_at}`) !== -1;
				if(!exists) {
					assignments.push({
						...rawAssignment,
						section: mutualIds.includes(rawAssignment.id) ? null : section,
					});
				}
			});
		});
		this.assignments = assignments;
	},
	cleanAssignments () {
		this.assignments = this.assignments.map((assignment) => {
			const course = this.courses[assignment.section ?? this.sections[0]].find(course => course.id === assignment.course_id);
			return {
				course: course.name,
				name: assignment.section ? `[${assignment.section.toUpperCase()}] ${assignment.name}` : assignment.name,
				htmlUrl: assignment.html_url,
				description: assignment.description,
				dueAt: assignment.due_at,
				groupType: assignment.group_category_id ? "Group" : "Individual",
				includedInFinalGrade: assignment.omit_from_final_grade ? "❌" : "✅",
			};
		});
	},
	calculateDueIn () {
		const now = moment();
		this.assignments = this.assignments.map(assignment => {
			let dueIn = this.MAX_DUE_IN;
			let humanizedDueIn = "-"
			const dueAt = moment(assignment.dueAt);
			if (assignment.dueAt) {
				dueIn = dueAt.diff(now, "minutes");
				humanizedDueIn = moment.duration(dueIn, "minutes").humanize(true);
			}
			return {
				...assignment,
				humanizedDueIn,
				dueIn,
			}
		});
	},
	calculateRowColor () {
		this.assignments = this.assignments.map((assignment) => {
			let dueColor = "#FFFFFF";
			if(assignment.dueIn === this.MAX_DUE_IN) {
				dueColor = "#FFFFFF";
			} else if(assignment.dueIn > 14 * 24 * 60) {
				dueColor = "#C1E1C1";
			} else if(assignment.dueIn > 7 * 24 * 60) {
				dueColor = "#FFFAA0";
			} else if(assignment.dueIn >= 0) {
				dueColor = "#FAA0A0";
			} else if(assignment.dueIn < 0) {
				dueColor = "#CFCFC4";
			}
			return { ...assignment, dueColor };
		});
	},
	sortAssignments () {
		const assignments = _.sortBy(this.assignments, "dueIn");
		const noDueAssignments = assignments.filter(a => a.dueIn === this.MAX_DUE_IN);
		const pastDueAssignments = assignments.filter(a => a.dueIn < 0);
		const stillDueAssignments = assignments.filter(a => a.dueIn >= 0);
		this.assignments = [
			...stillDueAssignments,
			...noDueAssignments,
			...pastDueAssignments,
		];
	},
	async populateAssignments () {
		this.loadingData = true;
		await this.fetchCourses();
		this.filterCourses();
		await this.fetchAssignments();
		// this.debugAssignmentDiffs();
		this.unifyAllAssignments();
		this.cleanAssignments();
		this.calculateDueIn();
		this.calculateRowColor();
		this.sortAssignments();
		this.displayedAssignments = this.assignments;
		this.loadingData = false;
	}
}